const Notification = require("./notification.model");

async function createNotification({
  userId,
  type,
  title,
  message,
  relatedId = null
}) {
  return Notification.create({
    userId,
    type,
    title,
    message,
    relatedId
  });
}

async function getUserNotifications(userId) {
  return Notification.find({ userId }).sort({ createdAt: -1 });
}

async function markAsRead(notificationId, userId) {
  return Notification.findOneAndUpdate(
    { _id: notificationId, userId },
    { isRead: true },
    { new: true }
  );
}

async function notifyReservationConfirmed(userId, reservationId) {
  return createNotification({
    userId,
    type: "RESERVATION_CONFIRMED",
    title: "Reservation Confirmed",
    message: "Your parking slot reservation has been confirmed.",
    relatedId: reservationId
  });
}

async function notifyReservationUpcoming(userId, reservationId) {
  return createNotification({
    userId,
    type: "RESERVATION_UPCOMING",
    title: "Upcoming Reservation",
    message: "Your parking reservation is coming up soon.",
    relatedId: reservationId
  });
}

async function notifyParkingExpiring(userId, reservationId) {
  return createNotification({
    userId,
    type: "PARKING_EXPIRING",
    title: "Parking Expiring Soon",
    message: "Your parking time is about to expire.",
    relatedId: reservationId
  });
}

async function notifyPaymentStatus(userId, paymentId, success) {
  return createNotification({
    userId,
    type: success ? "PAYMENT_SUCCESS" : "PAYMENT_FAILED",
    title: success ? "Payment Successful" : "Payment Failed",
    message: success
      ? "Your parking payment was successful."
      : "Your parking payment failed.",
    relatedId: paymentId
  });
}

async function notifyOverstay(userId, sessionId, fine) {
  return createNotification({
    userId,
    type: "OVERSTAY",
    title: "Parking Overstay Detected",
    message: `Your vehicle has overstayed. Additional fine: ₹${fine}.`,
    relatedId: sessionId
  });
}

module.exports = {
  createNotification,
  getUserNotifications,
  markAsRead,
  notifyReservationConfirmed,
  notifyReservationUpcoming,
  notifyParkingExpiring,
  notifyPaymentStatus,
  notifyOverstay
};
