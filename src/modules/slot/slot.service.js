const ParkingSlot = require("./slot.model");
const Vehicle = require("../vehicle/vehicle.model");

async function recommendSlot(vehicleNumber) {
  const vehicle = await Vehicle.findOne({
    vehicleNumber: vehicleNumber.toUpperCase()
  });

  if (!vehicle) {
    const error = new Error("Vehicle not found");
    error.statusCode = 404;
    throw error;
  }

  const suitableSlots = await ParkingSlot.find({
    status: "AVAILABLE",
    length: { $gte: vehicle.length },
    width: { $gte: vehicle.width },
    height: { $gte: vehicle.height }
  }).sort({
    length: 1,
    width: 1,
    height: 1
  });

  if (suitableSlots.length === 0) {
    const error = new Error(
      "No suitable parking slot is currently available"
    );
    error.statusCode = 404;
    throw error;
  }

  return suitableSlots[0];
}

module.exports = {
  recommendSlot
};