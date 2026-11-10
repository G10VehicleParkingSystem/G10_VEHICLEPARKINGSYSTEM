
const mongoose = require("mongoose");

const Subscription = require("./subscription.model");
const Vehicle = require("../vehicle/vehicle.model");
const ParkingSlot = require("../slot/slot.model");
const Reservation = require("../reservation/reservation.model");

const { vehicleFitsSlot } = require("../slot/slot.service");
const paymentService = require("../payment/payment.service");

const PENDING_TIMEOUT_MS = 5 * 60 * 1000;

function validateObjectId(value, fieldName) {
  if (!mongoose.isValidObjectId(value)) {
    throw new Error(`${fieldName} is not a valid id`);
  }
}

function getMonthlyRate() {
  const amount = Number(process.env.MONTHLY_SUBSCRIPTION_RATE || 3000);

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("MONTHLY_SUBSCRIPTION_RATE must be a positive number");
  }

  return amount;
}

function addOneCalendarMonth(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid subscription date");
  }

  const nextMonth = date.getUTCMonth() + 1;
  const targetYear = date.getUTCFullYear() + Math.floor(nextMonth / 12);
  const targetMonth = nextMonth % 12;

  const lastDay = new Date(
    Date.UTC(targetYear, targetMonth + 1, 0)
  ).getUTCDate();

  return new Date(
    Date.UTC(
      targetYear,
      targetMonth,
      Math.min(date.getUTCDate(), lastDay),
      date.getUTCHours(),
      date.getUTCMinutes(),
      date.getUTCSeconds(),
      date.getUTCMilliseconds()
    )
  );
}

function getMonthlyPlan() {
  return {
    planId: "MONTHLY_RESERVED",
    name: "Monthly Reserved Parking",
    durationMonths: 1,
    amount: getMonthlyRate(),
    currency: "INR"
  };
}

async function expireSubscriptions(now = new Date()) {
  const [expired, abandoned] = await Promise.all([
    Subscription.updateMany(
      {
        status: "ACTIVE",
        endDate: { $lte: now }
      },
      {
        $set: { status: "EXPIRED" },
        $unset: { slotLock: 1 }
      }
    ),

    Subscription.updateMany(
      {
        status: "PENDING_PAYMENT",
        pendingExpiresAt: {
          $ne: null,
          $lte: now
        }
      },
      {
        $set: { status: "PAYMENT_FAILED" },
        $unset: {
          slotLock: 1,
          pendingExpiresAt: 1
        }
      }
    )
  ]);

  return {
    expired: expired.modifiedCount,
    abandonedPayments: abandoned.modifiedCount
  };
}

async function ensureNoReservationOverlap(slotId, startDate, endDate) {
  const conflict = await Reservation.findOne({
    slotId,
    status: "CONFIRMED",
    startTime: { $lt: endDate },
    endTime: { $gt: startDate }
  });

  if (conflict) {
    throw new Error(
      "The selected slot has an existing reservation during this subscription period"
    );
  }
}

async function createSubscription({
  userId,
  vehicleId,
  slotId,
  paymentMethod
}) {
  validateObjectId(userId, "userId");
  validateObjectId(vehicleId, "vehicleId");
  validateObjectId(slotId, "slotId");

  const now = new Date();
  await expireSubscriptions(now);

  const [vehicle, slot] = await Promise.all([
    Vehicle.findById(vehicleId),
    ParkingSlot.findById(slotId)
  ]);

  if (!vehicle) {
    throw new Error("Vehicle not found");
  }

  if (!slot) {
    throw new Error("Parking slot not found");
  }

  if (slot.status !== "AVAILABLE") {
    throw new Error("Selected parking slot is currently occupied");
  }

  if (!vehicleFitsSlot(vehicle, slot)) {
    throw new Error("Vehicle does not fit the selected parking slot");
  }

  const startDate = now;
  const endDate = addOneCalendarMonth(startDate);
  const monthlyAmount = getMonthlyRate();

  await ensureNoReservationOverlap(slotId, startDate, endDate);

  const existingSubscription = await Subscription.findOne({
    slotLock: slotId
  });

  if (existingSubscription) {
    throw new Error(
      "The selected slot already has a pending or active subscription"
    );
  }

  let subscription;

  try {
    subscription = await Subscription.create({
      userId,
      vehicleId,
      slotId,
      startDate,
      endDate,
      monthlyAmount,
      status: "PENDING_PAYMENT",
      slotLock: slotId,
      pendingExpiresAt: new Date(now.getTime() + PENDING_TIMEOUT_MS)
    });
  } catch (error) {
    if (error.code === 11000) {
      throw new Error(
        "The selected parking slot is already reserved by another subscription"
      );
    }

    throw error;
  }

  try {
    const payment = await paymentService.payForSubscription({
      subscriptionId: subscription._id,
      userId,
      paymentMethod,
      amount: monthlyAmount,
      periodStart: startDate
    });

    subscription.status = "ACTIVE";
    subscription.paymentId = payment._id;
    subscription.pendingExpiresAt = null;

    await subscription.save();

    return { subscription, payment };
  } catch (error) {
    await Subscription.updateOne(
      {
        _id: subscription._id,
        status: "PENDING_PAYMENT"
      },
      {
        $set: { status: "PAYMENT_FAILED" },
        $unset: {
          slotLock: 1,
          pendingExpiresAt: 1
        }
      }
    );

    throw error;
  }
}

async function renewSubscription({
  subscriptionId,
  userId,
  paymentMethod
}) {
  validateObjectId(subscriptionId, "subscriptionId");
  validateObjectId(userId, "userId");

  await expireSubscriptions();

  const subscription = await Subscription.findOne({
    _id: subscriptionId,
    userId
  });

  if (!subscription) {
    throw new Error("Subscription not found");
  }

  if (subscription.status !== "ACTIVE") {
    throw new Error("Only active subscriptions can be renewed");
  }

  const periodStart = new Date(subscription.endDate);
  const periodEnd = addOneCalendarMonth(periodStart);
  const monthlyAmount = getMonthlyRate();

  await ensureNoReservationOverlap(
    subscription.slotId,
    periodStart,
    periodEnd
  );

  const payment = await paymentService.payForSubscription({
    subscriptionId: subscription._id,
    userId,
    paymentMethod,
    amount: monthlyAmount,
    periodStart
  });

  subscription.endDate = periodEnd;
  subscription.monthlyAmount = monthlyAmount;
  subscription.paymentId = payment._id;
  subscription.cancelAtPeriodEnd = false;

  await subscription.save();

  return { subscription, payment };
}

async function cancelSubscription({ subscriptionId, userId }) {
  validateObjectId(subscriptionId, "subscriptionId");
  validateObjectId(userId, "userId");

  await expireSubscriptions();

  const subscription = await Subscription.findOne({
    _id: subscriptionId,
    userId
  });

  if (!subscription) {
    throw new Error("Subscription not found");
  }

  if (subscription.status !== "ACTIVE") {
    throw new Error("Only active subscriptions can be cancelled");
  }

  if (subscription.cancelAtPeriodEnd) {
    throw new Error("Subscription is already scheduled for cancellation");
  }

  subscription.cancelAtPeriodEnd = true;
  await subscription.save();

  return subscription;
}

async function getUserSubscriptions(userId) {
  validateObjectId(userId, "userId");

  await expireSubscriptions();

  return Subscription.find({ userId }).sort({
    createdAt: -1
  });
}

module.exports = {
  getMonthlyPlan,
  createSubscription,
  renewSubscription,
  cancelSubscription,
  getUserSubscriptions,
  expireSubscriptions,
  addOneCalendarMonth
};
