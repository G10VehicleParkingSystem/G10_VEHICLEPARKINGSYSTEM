const ParkingSlot = require("./slot.model");
const Vehicle = require("../vehicle/vehicle.model");

function vehicleFitsSlot(vehicle, slot) {
  return (
    slot.length >= vehicle.length &&
    slot.width >= vehicle.width &&
    slot.height >= vehicle.height
  );
}

async function createSlot({ slotNumber, length, width, height }) {
  if (
    !slotNumber ||
    length === undefined ||
    width === undefined ||
    height === undefined
  ) {
    throw new Error("slotNumber, length, width and height are required");
  }

  if (
    typeof length !== "number" ||
    typeof width !== "number" ||
    typeof height !== "number"
  ) {
    throw new Error("Slot dimensions must be numbers");
  }

  if (length <= 0 || width <= 0 || height <= 0) {
    throw new Error("Slot dimensions must be greater than zero");
  }

  const existingSlot = await ParkingSlot.findOne({
    slotNumber: slotNumber.toUpperCase()
  });

  if (existingSlot) {
    throw new Error("Slot number already exists");
  }

  return ParkingSlot.create({
    slotNumber: slotNumber.toUpperCase(),
    length,
    width,
    height
  });
}

async function getSlots(status) {
  const filter = status ? { status: status.toUpperCase() } : {};
  return ParkingSlot.find(filter).sort({ slotNumber: 1 });
}

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
  vehicleFitsSlot,
  createSlot,
  getSlots,
  recommendSlot
};
