const HOUR_IN_MILLISECONDS = 60 * 60 * 1000;

function getPositiveRate(rate, settingName) {
  const parsedRate = Number(rate);
  if (!Number.isFinite(parsedRate) || parsedRate <= 0) {
    throw new Error(`${settingName} must be a positive number`);
  }
  return parsedRate;
}

function calculateReservationCharge(startTime, endTime, hourlyRate) {
  const start = new Date(startTime);
  const end = new Date(endTime);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new Error("Invalid reservation time");
  }
  if (end <= start) {
    throw new Error("Reservation end time must be after start time");
  }

  const rate = getPositiveRate(hourlyRate, "HOURLY_PARKING_RATE");
  const billableHours = Math.ceil((end - start) / HOUR_IN_MILLISECONDS);
  return Number((billableHours * rate).toFixed(2));
}

function calculateOverstayFine(endTime, now, finePerHour) {
  const scheduledEnd = new Date(endTime);
  const detectedAt = new Date(now);

  if (
    Number.isNaN(scheduledEnd.getTime()) ||
    Number.isNaN(detectedAt.getTime())
  ) {
    throw new Error("Invalid overstay time");
  }
  if (detectedAt <= scheduledEnd) {
    return { overdueMinutes: 0, fineAmount: 0 };
  }

  const rate = getPositiveRate(finePerHour, "FINE_PER_HOUR");
  const overdueMilliseconds = detectedAt - scheduledEnd;
  const overdueMinutes = Math.ceil(overdueMilliseconds / 60_000);
  const billableHours = Math.ceil(overdueMilliseconds / HOUR_IN_MILLISECONDS);

  return {
    overdueMinutes,
    fineAmount: Number((billableHours * rate).toFixed(2))
  };
}

module.exports = {
  calculateReservationCharge,
  calculateOverstayFine
};