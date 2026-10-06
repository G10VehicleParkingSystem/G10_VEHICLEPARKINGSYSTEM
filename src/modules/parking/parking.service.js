const ParkingSession = require("./parking.model");
const Vehicle = require("../vehicle/vehicle.model");

async function getVehicleTracking(vehicleNumber) {
  if (!vehicleNumber) {
    throw new Error("Vehicle number is required");
  }

  const vehicle = await Vehicle.findOne({
    vehicleNumber: vehicleNumber.toUpperCase()
  });

  if (!vehicle) {
    throw new Error("Vehicle not found");
  }

  const currentSession = await ParkingSession.findOne({
    vehicleId: vehicle._id,
    status: "ACTIVE"
  })
    .populate("slotId")
    .sort({ entryTime: -1 });

  const parkingHistory = await ParkingSession.find({
    vehicleId: vehicle._id,
    status: "COMPLETED"
  })
    .populate("slotId")
    .sort({ entryTime: -1 });

  return {
    vehicle,
    currentSlot: currentSession ? currentSession.slotId : null,
    parkingHistory
  };
}

module.exports = {
  getVehicleTracking
};