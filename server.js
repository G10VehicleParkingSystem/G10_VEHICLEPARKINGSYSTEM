require("dotenv").config();

const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");

const reservationRoutes = require("./src/modules/reservation/reservation.routes");
const notificationRoutes = require("./src/modules/notification/notification.routes");
const paymentRoutes = require("./src/modules/payment/payment.routes");
const overstayRoutes = require("./src/modules/overstay/overstay.routes");
const overstayService = require("./src/modules/overstay/overstay.service");
const notificationReminders = require("./src/modules/notification/notification.reminders");
const analyticsRoutes = require("./src/modules/analytics/analytics.routes");
const vehicleRoutes = require("./src/modules/vehicle/vehicle.routes");
const slotRoutes = require("./src/modules/slot/slot.routes");
const parkingRoutes = require("./src/modules/parking/parking.routes");
const subscriptionRoutes = require("./src/modules/subscription/subscription.routes");
const subscriptionService = require("./src/modules/subscription/subscription.service");


const app = express();


app.use(cors());
app.use(express.json());

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "G10 Vehicle Parking System backend (FR-1 to FR-8) is running"
  });
});

app.use("/api/reservations", reservationRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/overstays", overstayRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/vehicles", vehicleRoutes);
app.use("/api/slots", slotRoutes);
app.use("/api/parking", parkingRoutes);
app.use("/api/subscriptions", subscriptionRoutes);


const PORT = process.env.PORT || 5000;
const MONGO_URI =
  process.env.MONGO_URI ||
  "mongodb://127.0.0.1:27017/g10_vehicle_parking";

async function startServer() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("MongoDB connected");
    const configuredInterval = Number(
      process.env.OVERSTAY_CHECK_INTERVAL_MS || 60_000
    );
    const overstayInterval =
      Number.isFinite(configuredInterval) && configuredInterval > 0
        ? configuredInterval
        : 60_000;
    const detectOverstays = async () => {
      try {
        const result = await overstayService.detectOverstays();
        if (result.detected > 0) {
          console.log(`Detected ${result.detected} overdue reservation(s)`);
        }
      } catch (error) {
        console.error("Overstay detection failed:", error.message);
      }
    };
    const sendReminders = async () => {
      try {
        const result = await notificationReminders.sendReservationReminders();
        if (result.upcoming + result.expiring > 0) {
          console.log(
            `Sent ${result.upcoming} upcoming and ${result.expiring} expiry reminder(s)`
          );
        }
      } catch (error) {
        console.error("Reservation reminders failed:", error.message);
      }
    };
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
    setInterval(detectOverstays, overstayInterval).unref();
    setInterval(sendReminders, overstayInterval).unref();
    setInterval(expireSubscriptionRecords, overstayInterval).unref();
    void detectOverstays();
    void sendReminders();
    void expireSubscriptionRecords();
    app.listen(PORT, () => {
      console.log(`Server running at http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("MongoDB connection failed:");
    console.error(error.message);
    process.exit(1);
  }
}

startServer();
