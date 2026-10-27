const test = require("node:test");
const assert = require("node:assert/strict");

const Vehicle = require("../src/modules/vehicle/vehicle.model");
const ParkingSlot = require("../src/modules/slot/slot.model");
const vehicleService = require("../src/modules/vehicle/vehicle.service");
const slotService = require("../src/modules/slot/slot.service");
const { recommendSlot } = require("../src/modules/slot/slot.controller");
const { createResponse, stubModel } = require("./helpers/test-utils");

const car = {
  vehicleNumber: "KA01AB1234",
  type: "CAR",
  length: 4.5,
  width: 1.8,
  height: 1.5
};

test("vehicle registration rejects missing details", async () => {
  await assert.rejects(
    () => vehicleService.registerVehicle({ vehicleNumber: "KA01AB1234" }),
    /All vehicle details are required/
  );
});

test("vehicle registration rejects non-positive dimensions", async () => {
  await assert.rejects(
    () => vehicleService.registerVehicle({ ...car, width: 0 }),
    /greater than zero/
  );
});

test("vehicle registration stores the number in upper case", async (t) => {
  let created;
  stubModel(t, Vehicle, {
    findOne: async () => null,
    create: async (data) => {
      created = data;
      return data;
    }
  });

  await vehicleService.registerVehicle({ ...car, vehicleNumber: "ka01ab1234" });

  assert.equal(created.vehicleNumber, "KA01AB1234");
});

test("vehicle registration rejects duplicate vehicle numbers", async (t) => {
  stubModel(t, Vehicle, { findOne: async () => car });

  await assert.rejects(
    () => vehicleService.registerVehicle(car),
    /already registered/
  );
});

test("vehicleFitsSlot compares every dimension", () => {
  assert.equal(
    slotService.vehicleFitsSlot(car, { length: 5, width: 2, height: 2 }),
    true
  );
  assert.equal(
    slotService.vehicleFitsSlot(car, { length: 5, width: 2, height: 1.4 }),
    false
  );
});

test("slot creation validates dimensions", async () => {
  await assert.rejects(
    () => slotService.createSlot({ slotNumber: "A1", length: "5", width: 2, height: 2 }),
    /must be numbers/
  );
});

test("recommendation queries available slots large enough for the vehicle", async (t) => {
  let query;
  let sort;
  const slot = { slotNumber: "A1" };
  stubModel(t, Vehicle, { findOne: async () => car });
  stubModel(t, ParkingSlot, {
    find: (filter) => {
      query = filter;
      return {
        sort: async (order) => {
          sort = order;
          return [slot];
        }
      };
    }
  });

  const result = await slotService.recommendSlot("ka01ab1234");

  assert.equal(result, slot);
  assert.deepEqual(query, {
    status: "AVAILABLE",
    length: { $gte: 4.5 },
    width: { $gte: 1.8 },
    height: { $gte: 1.5 }
  });
  assert.deepEqual(sort, { length: 1, width: 1, height: 1 });
});

test("recommendation reports when no suitable slot is available", async (t) => {
  stubModel(t, Vehicle, { findOne: async () => car });
  stubModel(t, ParkingSlot, { find: () => ({ sort: async () => [] }) });

  await assert.rejects(
    () => slotService.recommendSlot("KA01AB1234"),
    (error) =>
      error.statusCode === 404 &&
      /No suitable parking slot/.test(error.message)
  );
});

test("recommend controller requires a vehicle number", async () => {
  const res = createResponse();

  await recommendSlot({ body: {} }, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, "vehicleNumber is required");
});
