const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const mongoose = require("mongoose");

const app = require("../../app");
const Vehicle = require("../../src/modules/vehicle/vehicle.model");

const TEST_DB_URI =
  "mongodb://127.0.0.1:27017/g10_vehicle_parking_test_fr1";

describe("FR-1 Vehicle API Integration Tests", () => {
  let vehicleNumber;
  let qrToken;

  before(async () => {
    await mongoose.connect(TEST_DB_URI);
    await mongoose.connection.dropDatabase();
  });

  after(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  it("should register a vehicle and persist it in MongoDB", async () => {
    vehicleNumber = `KA01AB${Date.now().toString().slice(-4)}`;

    const response = await request(app)
      .post("/api/vehicles")
      .send({
        vehicleNumber: vehicleNumber.toLowerCase(),
        type: "CAR",
        length: 4.5,
        width: 2,
        height: 1.8
      });

    assert.equal(response.status, 201);
    assert.equal(response.body.success, true);
    assert.equal(response.body.vehicle.vehicleNumber, vehicleNumber);
    assert.match(response.body.qrCode, /^data:image\/png;base64,/);

    const savedVehicle = await Vehicle.findOne({
      vehicleNumber
    }).select("+qrToken");

    assert.ok(savedVehicle);
    assert.ok(savedVehicle.qrToken);

    qrToken = savedVehicle.qrToken;

    assert.equal(savedVehicle.type, "CAR");
  });

  it("should reject duplicate vehicle registration", async () => {
    const response = await request(app)
      .post("/api/vehicles")
      .send({
        vehicleNumber,
        type: "CAR",
        length: 4.5,
        width: 2,
        height: 1.8
      });

    assert.equal(response.status, 400);
    assert.equal(response.body.success, false);
  });

  it("should reject invalid vehicle dimensions", async () => {
    const response = await request(app)
      .post("/api/vehicles")
      .send({
        vehicleNumber: "KA01INVALID",
        type: "CAR",
        length: -4,
        width: 2,
        height: 1.8
      });

    assert.equal(response.status, 400);
  });

  it("should retrieve the registered vehicle", async () => {
    const response = await request(app)
      .get(`/api/vehicles/${vehicleNumber}`);

    assert.equal(response.status, 200);
    assert.equal(response.body.vehicle.vehicleNumber, vehicleNumber);
  });

  it("should retrieve the vehicle QR code", async () => {
    const response = await request(app)
      .get(`/api/vehicles/${vehicleNumber}/qr`);

    assert.equal(response.status, 200);
    assert.match(response.body.qrCode, /^data:image\/png;base64,/);
  });

  it("should identify a vehicle using its valid QR token", async () => {
    const response = await request(app)
      .post("/api/vehicles/verify-qr")
      .send({ token: qrToken });

    assert.equal(response.status, 200);
    assert.equal(response.body.success, true);
    assert.equal(response.body.vehicle.vehicleNumber, vehicleNumber);
    assert.equal(response.body.vehicle.type, "CAR");
    assert.equal(
      Object.hasOwn(response.body.vehicle, "qrToken"),
      false
    );
  });

  it("should reject an invalid QR token", async () => {
    const response = await request(app)
      .post("/api/vehicles/verify-qr")
      .send({ token: "invalid-token" });

    assert.equal(response.status, 400);
  });

  it("should reject a missing QR token", async () => {
    const response = await request(app)
      .post("/api/vehicles/verify-qr")
      .send({});

    assert.equal(response.status, 400);
  });
});

