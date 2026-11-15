
require("dotenv").config();

const fs = require("fs");
const path = require("path");
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");

const reservationRoutes = require("./src/modules/reservation/reservation.routes");
const notificationRoutes = require("./src/modules/notification/notification.routes");
const paymentRoutes = require("./src/modules/payment/payment.routes");
const overstayRoutes = require("./src/modules/overstay/overstay.routes");
const overstayService = require("./src/modules/overstay/overstay.service");
const analyticsRoutes = require("./src/modules/analytics/analytics.routes");
const vehicleRoutes = require("./src/modules/vehicle/vehicle.routes");
const slotRoutes = require("./src/modules/slot/slot.routes");
const parkingRoutes = require("./src/modules/parking/parking.routes");
const subscriptionRoutes = require("./src/modules/subscription/subscription.routes");
const subscriptionService = require("./src/modules/subscription/subscription.service");

// FR-9: Review module
const reviewRoutes = require("./src/modules/review/review.routes");

// Security (D-1): accounts, login tokens and role checks
const authRoutes = require("./src/modules/auth/auth.routes");
const authService = require("./src/modules/auth/auth.service");
const { requireAuth, requireAdmin, bindUser } = require("./src/modules/auth/auth.middleware");

const app = express();

app.use(cors());
app.use(express.json());

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "G10 Vehicle Parking System backend (FR-1 to FR-9) is running"
  });
});

// Sign-up and sign-in are open; every other API route needs a signed-in user, whose
// id comes from the token (bindUser) instead of a userId parameter.
app.use("/api/auth", authRoutes);

const signedIn = [requireAuth, bindUser];

app.use("/api/reservations", signedIn, reservationRoutes);
app.use("/api/notifications", signedIn, notificationRoutes);
app.use("/api/payments", signedIn, paymentRoutes);
app.use("/api/overstays", signedIn, overstayRoutes);
app.use("/api/analytics", signedIn, requireAdmin, analyticsRoutes);
app.use("/api/vehicles", signedIn, vehicleRoutes);
app.use("/api/slots", signedIn, slotRoutes);
app.use("/api/parking", signedIn, parkingRoutes);
app.use("/api/subscriptions", signedIn, subscriptionRoutes);

// FR-9: Review routes
app.use("/api/reviews", signedIn, reviewRoutes);

// Unknown API paths answer in JSON rather than falling through to the web app.
app.use("/api", (req, res) => {
  res.status(404).json({ success: false, message: "Not found" });
});

// Web front end: serve the built React app (frontend/dist) when it exists, and send
// every non-API path to index.html so its client-side routes work on refresh.
const frontendDist = path.join(__dirname, "frontend", "dist");
if (fs.existsSync(path.join(frontendDist, "index.html"))) {
  app.use(express.static(frontendDist));
  app.get(/^\/(?!api\/).*/, (req, res) => {
    res.sendFile(path.join(frontendDist, "index.html"));
  });
}

const PORT = process.env.PORT || 5000;

const MONGO_URI =
  process.env.MONGO_URI ||
  "mongodb://127.0.0.1:27017/g10_vehicle_parking";

async function startServer() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("MongoDB connected");

    // Parking office account from ADMIN_EMAIL / ADMIN_PASSWORD, if set.
    try {
      const admin = await authService.ensureAdmin({
        email: process.env.ADMIN_EMAIL,
        password: process.env.ADMIN_PASSWORD
      });
      if (admin) console.log(`Parking office account: ${admin.email}`);
    } catch (error) {
      console.error("Could not create the parking office account:", error.message);
    }

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

    // Start all background schedulers
    setInterval(detectOverstays, overstayInterval).unref();
    setInterval(sendReminders, overstayInterval).unref();
    setInterval(expireSubscriptionRecords, overstayInterval).unref();

    // Run each job once when the server starts
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
