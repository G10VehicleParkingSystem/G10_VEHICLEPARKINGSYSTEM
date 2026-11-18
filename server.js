
require("dotenv").config();

const mongoose = require("mongoose");
const app = require("./app");

const overstayService = require("./src/modules/overstay/overstay.service");
const notificationReminders = require("./src/modules/notification/notification.reminders");
const subscriptionService = require("./src/modules/subscription/subscription.service");

const PORT = process.env.PORT || 5000;

const MONGO_URI =
  process.env.MONGO_URI ||
  "mongodb://127.0.0.1:27017/g10_vehicle_parking";

async function startServer() {
  try {
    // Connect to MongoDB
    await mongoose.connect(MONGO_URI);
    console.log("MongoDB connected successfully");

    const configuredInterval = Number(
      process.env.OVERSTAY_CHECK_INTERVAL_MS || 60_000
    );

    const overstayInterval =
      Number.isFinite(configuredInterval) && configuredInterval > 0
        ? configuredInterval
        : 60_000;

    // Detect overdue parking sessions
    const detectOverstays = async () => {
      try {
        const result = await overstayService.detectOverstays();

        if (result.detected > 0) {
          console.log(
            `Detected ${result.detected} overdue reservation(s)`
          );
        }
      } catch (error) {
        console.error("Overstay detection failed:", error.message);
      }
    };

    // Send reservation reminders
    const sendReminders = async () => {
      try {
        const result =
          await notificationReminders.sendReservationReminders();

        if (result.upcoming + result.expiring > 0) {
          console.log(
            `Sent ${result.upcoming} upcoming and ${result.expiring} expiry reminder(s)`
          );
        }
      } catch (error) {
        console.error("Reservation reminders failed:", error.message);
      }
    };

    // Expire subscriptions and abandoned payments
    const expireSubscriptionRecords = async () => {
      try {
        const result = await subscriptionService.expireSubscriptions();

        if (result.expired > 0 || result.abandonedPayments > 0) {
          console.log(
            `Expired ${result.expired} subscription(s) and cleared ${result.abandonedPayments} abandoned pending payment(s)`
          );
        }
      } catch (error) {
        console.error("Subscription expiry failed:", error.message);
      }
    };

    // Start background schedulers
    const timers = [
      setInterval(detectOverstays, overstayInterval),
      setInterval(sendReminders, overstayInterval),
      setInterval(expireSubscriptionRecords, overstayInterval)
    ];

    timers.forEach((timer) => timer.unref());

    // Run each background job once at startup
    void detectOverstays();
    void sendReminders();
    void expireSubscriptionRecords();

    // Start Express server
    const server = app.listen(PORT, () => {
      console.log(`Server running at http://localhost:${PORT}`);
    });

    return server;
  } catch (error) {
    console.error("Server startup failed:");
    console.error(error.message);
    throw error;
  }
}

// Start server only when this file is executed directly.
// Importing app.js will never start MongoDB or open a server.
if (require.main === module) {
  startServer().catch(() => {
    process.exit(1);
  });
}

module.exports = { startServer };
