
const express = require("express");
const cors = require("cors");

const reservationRoutes = require("./src/modules/reservation/reservation.routes");
const notificationRoutes = require("./src/modules/notification/notification.routes");
const paymentRoutes = require("./src/modules/payment/payment.routes");
const overstayRoutes = require("./src/modules/overstay/overstay.routes");
const analyticsRoutes = require("./src/modules/analytics/analytics.routes");
const vehicleRoutes = require("./src/modules/vehicle/vehicle.routes");
const slotRoutes = require("./src/modules/slot/slot.routes");
const parkingRoutes = require("./src/modules/parking/parking.routes");
const subscriptionRoutes = require("./src/modules/subscription/subscription.routes");
const reviewRoutes = require("./src/modules/review/review.routes");

const app = express();

app.use(cors());
app.use(express.json());

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "G10 Vehicle Parking System backend (FR-1 to FR-9) is running"
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
app.use("/api/reviews", reviewRoutes);

module.exports = app;
