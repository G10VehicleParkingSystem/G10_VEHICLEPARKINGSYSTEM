require("dotenv").config();

const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");

const reservationRoutes = require("./src/modules/reservation/reservation.routes");
const notificationRoutes = require("./src/modules/notification/notification.routes");
const analyticsRoutes = require("./src/modules/analytics/analytics.routes");
const vehicleRoutes = require("./src/modules/vehicle/vehicle.routes");
const slotRoutes = require("./src/modules/slot/slot.routes");
const parkingRoutes = require("./src/modules/parking/parking.routes");

const app = express();


app.use(cors());
app.use(express.json());

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "G10 FR-2 + FR-7 backend is running"
  });
});

app.use("/api/reservations", reservationRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/vehicles", vehicleRoutes);
app.use("/api/slots", slotRoutes);
app.use("/api/parking", parkingRoutes);

const PORT = process.env.PORT || 5001;
const MONGO_URI =
  process.env.MONGO_URI ||
  "mongodb://127.0.0.1:27017/g10_vehicle_parking";

async function startServer() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("MongoDB connected");
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
