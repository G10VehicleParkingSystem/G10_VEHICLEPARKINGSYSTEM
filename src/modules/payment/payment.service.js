const { randomUUID } = require("crypto");
const Payment = require("./payment.model");
const Reservation = require("../reservation/reservation.model");
const OverstayFine = require("../overstay/overstay.model");
const notificationService = require("../notification/notification.service");
const { processDigitalPayment } = require("./payment.gateway");
const { calculateReservationCharge } = require("./payment.calculations");

const PAYMENT_METHODS = ["UPI", "CARD", "NET_BANKING", "WALLET"];

function getHourlyRate() {
  return Number(process.env.HOURLY_PARKING_RATE || 50);
}

function validatePaymentMethod(paymentMethod) {
  if (!PAYMENT_METHODS.includes(paymentMethod)) {
    throw new Error(`paymentMethod must be one of: ${PAYMENT_METHODS.join(", ")}`);
  }
}

async function recordPayment({ userId, paymentMethod, amount, target }) {
  const gatewayResult = await processDigitalPayment({ amount, paymentMethod });
  const payment = await Payment.create({
    userId,
    ...target,
    amount,
    currency: "INR",
    paymentMethod,
    status: gatewayResult.status,
    provider: gatewayResult.provider,
    transactionId: `TXN-${randomUUID()}`,
    providerReference: gatewayResult.providerReference
  });

  await notificationService.notifyPaymentStatus(userId, payment._id, true);
  return payment;
}

async function payForReservation({ reservationId, userId, paymentMethod }) {
  validatePaymentMethod(paymentMethod);

  const reservation = await Reservation.findOne({
    _id: reservationId,
    userId
  });
  if (!reservation) {
    throw new Error("Reservation not found");
  }

  const existingPayment = await Payment.findOne({
    reservationId,
    status: "SUCCESS"
  });
  if (existingPayment) {
    return existingPayment;
  }
  if (reservation.status !== "CONFIRMED") {
    throw new Error("Only confirmed reservations can be paid");
  }

  const amount = calculateReservationCharge(
    reservation.startTime,
    reservation.endTime,
    getHourlyRate()
  );

  try {
    return await recordPayment({
      userId,
      paymentMethod,
      amount,
      target: { reservationId }
    });
  } catch (error) {
    if (error.code === 11000) {
      return Payment.findOne({ reservationId, status: "SUCCESS" });
    }
    throw error;
  }
}

async function payFine({ fineId, userId, paymentMethod }) {
  validatePaymentMethod(paymentMethod);

  const fine = await OverstayFine.findOne({ _id: fineId, userId });
  if (!fine) {
    throw new Error("Fine not found");
  }

  const existingPayment = await Payment.findOne({ fineId, status: "SUCCESS" });
  if (existingPayment) {
    fine.status = "PAID";
    fine.paidAt = fine.paidAt || existingPayment.createdAt;
    await fine.save();
    return existingPayment;
  }
  if (fine.status === "PAID") {
    throw new Error("Fine is already paid");
  }

  const reservation = await Reservation.findOne({
    _id: fine.reservationId,
    userId,
    status: "COMPLETED"
  });
  if (!reservation) {
    throw new Error("Overstay fine can be paid after checkout");
  }

  const payment = await recordPayment({
    userId,
    paymentMethod,
    amount: fine.fineAmount,
    target: { fineId }
  }).catch(async (error) => {
    if (error.code === 11000) {
      return Payment.findOne({ fineId, status: "SUCCESS" });
    }
    throw error;
  });

  fine.status = "PAID";
  fine.paidAt = new Date();
  await fine.save();
  return payment;
}

async function getUserTransactions(userId) {
  return Payment.find({ userId }).sort({ createdAt: -1 });
}

module.exports = {
  payForReservation,
  payFine,
  getUserTransactions
};