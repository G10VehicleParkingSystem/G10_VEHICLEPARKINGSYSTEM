require("dotenv").config();

const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");

const reservationRoutes = require("./src/modules/reservation/reservation.routes");
const notificationRoutes = require("./src/modules/notification/notification.routes");
const paymentRoutes = require("./src/modules/payment/payment.routes");
const overstayRoutes = require("./src/modules/overstay/overstay.routes");
const overstayService = require("./src/modules/overstay/overstay.service");

const app = express();


app.use(cors());
app.use(express.json());

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "G10 FR-2 + FR-3 + FR-5 + FR-7 backend is running"
  });
});

app.use("/api/reservations", reservationRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/overstays", overstayRoutes);

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
    setInterval(detectOverstays, overstayInterval).unref();
    void detectOverstays();
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
