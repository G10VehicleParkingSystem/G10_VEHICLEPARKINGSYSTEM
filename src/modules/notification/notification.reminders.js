const Reservation = require("../reservation/reservation.model");
const notificationService = require("./notification.service");

const MINUTE_IN_MILLISECONDS = 60 * 1000;

function getMinutesSetting(value, fallback) {
  const minutes = Number(value);
  return Number.isFinite(minutes) && minutes > 0 ? minutes : fallback;
}

function getUpcomingWindowMs() {
  return (
    getMinutesSetting(process.env.UPCOMING_REMINDER_MINUTES, 30) *
    MINUTE_IN_MILLISECONDS
  );
}

function getExpiryWindowMs() {
  return (
    getMinutesSetting(process.env.EXPIRY_REMINDER_MINUTES, 15) *
    MINUTE_IN_MILLISECONDS
  );
}

// Claims each reservation atomically before notifying, so overlapping
// scheduler runs never send the same reminder twice.
async function claimAndNotify(filter, flagField, notify, now) {
  let sent = 0;

  for (;;) {
    const reservation = await Reservation.findOneAndUpdate(
      { ...filter, [flagField]: null },
      { $set: { [flagField]: now } },
      { new: true }
    );

    if (!reservation) {
      return sent;
    }

    await notify(reservation.userId, reservation._id);
    sent += 1;
  }
}

async function sendReservationReminders(now = new Date()) {
  const upcoming = await claimAndNotify(
    {
      status: "CONFIRMED",
      startTime: {
        $gt: now,
        $lte: new Date(now.getTime() + getUpcomingWindowMs())
      }
    },
    "upcomingNotifiedAt",
    notificationService.notifyReservationUpcoming,
    now
  );

  const expiring = await claimAndNotify(
    {
      status: "CONFIRMED",
      startTime: { $lte: now },
      endTime: {
        $gt: now,
        $lte: new Date(now.getTime() + getExpiryWindowMs())
      }
    },
    "expiryNotifiedAt",
    notificationService.notifyParkingExpiring,
    now
  );

  return { upcoming, expiring };
}

module.exports = {
  sendReservationReminders
};
