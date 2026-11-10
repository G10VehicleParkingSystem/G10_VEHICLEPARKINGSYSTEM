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

async function recordFailedPayment({ userId, paymentMethod, amount, target }) {
  const payment = await Payment.create({
    userId,
    ...target,
    amount,
    currency: "INR",
    paymentMethod,
    status: "FAILED",
    transactionId: `TXN-${randomUUID()}`,
    providerReference: "NOT_PROCESSED"
  });

  await notificationService.notifyPaymentStatus(userId, payment._id, false);
  return payment;
}

async function recordPayment({ userId, paymentMethod, amount, target }) {
  let gatewayResult;
  try {
    gatewayResult = await processDigitalPayment({ amount, paymentMethod });
  } catch (error) {
    await recordFailedPayment({ userId, paymentMethod, amount, target });
    throw new Error(`Payment failed: ${error.message}`);
  }

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

  await notificationService.notifyPaymentStatus(
    userId,
    payment._id,
    payment.status === "SUCCESS"
  );
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

async function payForSubscription({
  subscriptionId,
  userId,
  paymentMethod,
  amount,
  periodStart
}) {
  validatePaymentMethod(paymentMethod);

  const numericAmount = Number(amount);
  const billingPeriodStart = new Date(periodStart);

  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    throw new Error("Subscription payment amount must be positive");
  }

  if (Number.isNaN(billingPeriodStart.getTime())) {
    throw new Error("Invalid subscription billing period");
  }

  const paymentFilter = {
    subscriptionId,
    subscriptionPeriodStart: billingPeriodStart,
    status: "SUCCESS"
  };

  // Return an existing successful payment on retry.
  const existingPayment = await Payment.findOne(paymentFilter);

  if (existingPayment) {
    return existingPayment;
  }

  try {
    return await recordPayment({
      userId,
      paymentMethod,
      amount: numericAmount,
      target: {
        subscriptionId,
        subscriptionPeriodStart: billingPeriodStart
      }
    });
  } catch (error) {
    // Handle duplicate requests and notification errors after payment creation.
    const savedPayment = await Payment.findOne(paymentFilter);

    if (savedPayment) {
      return savedPayment;
    }

    throw error;
  }
}

async function getUserTransactions(userId) {
  return Payment.find({ userId }).sort({ createdAt: -1 });
}

module.exports = {
  payForReservation,
  payFine,
  payForSubscription,
  getUserTransactions
};