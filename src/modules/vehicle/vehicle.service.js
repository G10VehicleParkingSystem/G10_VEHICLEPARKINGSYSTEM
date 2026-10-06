const Vehicle = require("./vehicle.model");

async function registerVehicle({
  vehicleNumber,
  type,
  length,
  width,
  height
}) {
  if (
    !vehicleNumber ||
    !type ||
    length === undefined ||
    width === undefined ||
    height === undefined
  ) {
    throw new Error("All vehicle details are required");
  }

  if (
    typeof length !== "number" ||
    typeof width !== "number" ||
    typeof height !== "number"
  ) {
    throw new Error("Vehicle dimensions must be numbers");
  }

  if (length <= 0 || width <= 0 || height <= 0) {
    throw new Error("Vehicle dimensions must be greater than zero");
  }

  const existingVehicle = await Vehicle.findOne({
    vehicleNumber: vehicleNumber.toUpperCase()
  });

  if (existingVehicle) {
    throw new Error("Vehicle is already registered");
  }

  return Vehicle.create({
    vehicleNumber: vehicleNumber.toUpperCase(),
    type,
    length,
    width,
    height
  });
}

async function getVehicle(vehicleNumber) {
  const vehicle = await Vehicle.findOne({
    vehicleNumber: vehicleNumber.toUpperCase()
  });

  if (!vehicle) {
    throw new Error("Vehicle not found");
  }

  return vehicle;
}

module.exports = {
  registerVehicle,
  getVehicle
};