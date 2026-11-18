// White-box tests for the HTTP controllers. Every controller has the same decision
// structure: (1) input checks that answer 400 before the service is called, (2) the
// service succeeds -> success status, (3) the service throws -> error status. The
// table below drives each handler down every one of those branches.
const test = require("node:test");
const assert = require("node:assert/strict");
const { createResponse, id } = require("./helpers/test-utils");

const hex = () => String(id());
const service = (name) => require(`../src/modules/${name}/${name}.service`);
const controller = (name) => require(`../src/modules/${name}/${name}.controller`);

// Replaces service functions for one test (controllers call them through the module).
function stubService(t, mod, fns) {
  for (const [name, impl] of Object.entries(fns)) {
    const original = mod[name];
    mod[name] = impl;
    t.after(() => {
      mod[name] = original;
    });
  }
}

async function call(handler, req) {
  const res = createResponse();
  await handler({ body: {}, query: {}, params: {}, ...req }, res);
  return res;
}

const user = hex();
const CASES = [
  // module, handler, service functions used, valid request, success status, error status, invalid requests
  ["analytics", "getAnalytics", ["getAnalytics"], {}, 200, 500],
  ["slot", "createSlot", ["createSlot"], { body: { slotNumber: "A1" } }, 201, 400],
  ["slot", "getSlots", ["getSlots"], { query: { status: "available" } }, 200, 500],
  ["slot", "recommendSlot", ["recommendSlot"], { body: { vehicleNumber: "KA01" } }, 200, 500, [{ body: {} }]],
  ["reservation", "createReservation", ["createReservation"],
    { body: { userId: user, vehicleId: hex(), slotId: hex(), startTime: "s", endTime: "e" } }, 201, 400,
    [{ body: { userId: user } }]],
  ["reservation", "getMyReservations", ["getUserReservations"], { params: { userId: user } }, 200, 500],
  ["reservation", "cancelReservation", ["cancelReservation"], { params: { id: hex() }, query: { userId: user } }, 200, 400],
  ["payment", "payForReservation", ["payForReservation"],
    { params: { reservationId: hex() }, body: { userId: user, paymentMethod: "UPI" } }, 201, 400,
    [{ body: { userId: user } }, { body: { paymentMethod: "UPI" } }]],
  ["payment", "payFine", ["payFine"],
    { params: { fineId: hex() }, body: { userId: user, paymentMethod: "CARD" } }, 201, 400, [{ body: {} }]],
  ["payment", "getTransactions", ["getUserTransactions"], { params: { userId: user } }, 200, 500],
  ["overstay", "detectOverstays", ["detectOverstays"], {}, 200, 500],
  ["overstay", "getFines", ["getUserFines"], { params: { userId: user } }, 200, 500],
  ["overstay", "checkout", ["checkout"], { params: { reservationId: hex() }, body: { userId: user } }, 200, 400, [{ body: {} }]],
  ["parking", "checkIn", ["checkIn"], { body: { reservationId: hex(), userId: user } }, 201, 400, [{ body: { userId: user } }]],
  ["parking", "checkInSubscription", ["checkInSubscription"], { body: { subscriptionId: hex(), userId: user } }, 201, 400,
    [{ body: { userId: user } }]],
  ["parking", "checkOutSubscription", ["checkOutSubscription"],
    { params: { subscriptionId: hex() }, body: { userId: user } }, 200, 400, [{ params: {}, body: { userId: user } }]],
  ["parking", "getVehicleTracking", ["getVehicleTracking"], { params: { vehicleNumber: "KA01" } }, 200, 404],
  ["notification", "createNotification", ["createNotification"],
    { body: { userId: user, type: "FINE", title: "t", message: "m" } }, 201, 400, [{ body: { userId: user } }]],
  ["notification", "getNotifications", ["getUserNotifications"], { params: { userId: user } }, 200, 500],
  ["subscription", "getMonthlyPlan", ["getMonthlyPlan"], {}, 200, 400],
  ["subscription", "createSubscription", ["createSubscription"],
    { body: { userId: user, vehicleId: hex(), slotId: hex(), paymentMethod: "UPI" } }, 201, 400, [{ body: { userId: user } }]],
  ["subscription", "getMySubscriptions", ["getUserSubscriptions"], { params: { userId: user } }, 200, 400],
  ["subscription", "renewSubscription", ["renewSubscription"],
    { params: { id: hex() }, body: { userId: user, paymentMethod: "UPI" } }, 201, 400, [{ body: { userId: user } }]],
  ["subscription", "cancelSubscription", ["cancelSubscription"], { params: { id: hex() }, body: { userId: user } }, 200, 400,
    [{ body: {} }]],
  ["review", "getReviewsBySlot", ["getReviewsBySlot", "getSlotRating"], { params: { slotId: hex() } }, 200, 500,
    [{ params: { slotId: "not-an-id" } }]],
  ["review", "getReviewsByUser", ["getReviewsByUser"], { params: { userId: user } }, 200, 500, [{ params: { userId: "x" } }]],
  ["review", "updateReview", ["updateReview"], { params: { id: hex() }, body: { userId: user, rating: 4, review: "ok" } }, 200, 400,
    [
      { params: { id: "x" }, body: { userId: user, rating: 4 } },
      { params: { id: hex() }, body: { userId: user, rating: 6 } },
      { params: { id: hex() }, body: { userId: user, rating: 0 } },
      { params: { id: hex() }, body: { userId: user, rating: 3.5 } },
      { params: { id: hex() }, body: { userId: user, rating: 4, review: "x".repeat(501) } }
    ]],
  ["review", "deleteReview", ["deleteReview"], { params: { id: hex() }, query: { userId: user } }, 200, 500,
    [{ params: { id: hex() }, query: {} }]],
  ["vehicle", "getVehicle", ["getVehicle"], { params: { vehicleNumber: "KA01" } }, 200, 404],
  ["vehicle", "getVehicleQr", ["getVehicleQr"], { params: { vehicleNumber: "KA01" } }, 200, 404],
  ["vehicle", "verifyVehicleQr", ["verifyVehicleQr"], { body: { token: "abc" } }, 200, 400],
  ["vehicle", "getMyVehicles", ["getUserVehicles"], { user: { id: user } }, 200, 500]
];

for (const [mod, handler, fns, validReq, okStatus, errorStatus, invalid = []] of CASES) {
  test(`WB-CTL ${mod}.${handler}: valid input -> ${okStatus}, service error -> ${errorStatus}` +
    (invalid.length ? `, ${invalid.length} invalid input(s) -> 400` : ""), async (t) => {
    const svc = service(mod);
    const fn = controller(mod)[handler];
    let calls = 0;
    const ok = async () => ((calls += 1), { _id: "x", vehicle: {} });

    stubService(t, svc, Object.fromEntries(fns.map((f) => [f, ok])));
    for (const req of invalid) {
      const res = await call(fn, req);
      assert.equal(res.statusCode, 400, JSON.stringify(req));
      assert.equal(res.body.success, false);
    }
    assert.equal(calls, 0, "the service must not run for invalid input");

    const good = await call(fn, validReq);
    assert.equal(good.statusCode, okStatus);
    assert.equal(good.body.success, true);

    stubService(t, svc, Object.fromEntries(fns.map((f) => [f, () => { throw new Error("boom"); }])));
    const bad = await call(fn, validReq);
    assert.equal(bad.statusCode, errorStatus);
    assert.equal(bad.body.success, false);
  });
}

test("WB-CTL vehicle.registerVehicle passes the signed-in owner and answers 201 / 400", async (t) => {
  const svc = service("vehicle");
  let input;
  stubService(t, svc, {
    registerVehicle: async (data) => ((input = data), { vehicle: { _id: "v", vehicleNumber: "KA01", type: "CAR" }, qrCode: "data:" })
  });
  const res = await call(controller("vehicle").registerVehicle, { body: { vehicleNumber: "KA01" }, user: { id: user } });
  assert.equal(res.statusCode, 201);
  assert.equal(input.owner, user);
  assert.equal(res.body.qrCode, "data:");

  stubService(t, svc, { registerVehicle: async () => { throw new Error("Vehicle is already registered"); } });
  const dup = await call(controller("vehicle").registerVehicle, { body: {} });
  assert.equal(dup.statusCode, 400);
});

test("WB-CTL vehicle.ownVehicleOnly: owner passes, others get 403, errors 500", async (t) => {
  const svc = service("vehicle");
  const guard = controller("vehicle").ownVehicleOnly;
  const run = async () => {
    const res = createResponse();
    let passed = false;
    await guard({ params: { vehicleNumber: "KA01" }, user: { id: user, role: "student" } }, res, () => (passed = true));
    return { res, passed };
  };

  stubService(t, svc, { canSeeVehicle: async () => true });
  assert.equal((await run()).passed, true);
  stubService(t, svc, { canSeeVehicle: async () => false });
  assert.equal((await run()).res.statusCode, 403);
  stubService(t, svc, { canSeeVehicle: async () => { throw new Error("db"); } });
  assert.equal((await run()).res.statusCode, 500);
});

test("WB-CTL review update / delete answer 404 when the review is not the user's", async (t) => {
  const svc = service("review");
  stubService(t, svc, { updateReview: async () => null, deleteReview: async () => null });
  const upd = await call(controller("review").updateReview, { params: { id: hex() }, body: { userId: user, rating: 3 } });
  assert.equal(upd.statusCode, 404);
  const del = await call(controller("review").deleteReview, { params: { id: hex() }, query: { userId: user } });
  assert.equal(del.statusCode, 404);
});

test("WB-CTL notification.markNotificationAsRead: 200, 404 when missing, 500 on error", async (t) => {
  const svc = service("notification");
  const fn = controller("notification").markNotificationAsRead;
  const req = { params: { id: hex() }, query: { userId: user } };
  stubService(t, svc, { markAsRead: async () => ({ isRead: true }) });
  assert.equal((await call(fn, req)).statusCode, 200);
  stubService(t, svc, { markAsRead: async () => null });
  assert.equal((await call(fn, req)).statusCode, 404);
  stubService(t, svc, { markAsRead: async () => { throw new Error("db"); } });
  assert.equal((await call(fn, req)).statusCode, 500);
});

test("WB-CTL auth controller: register 201, login 200, me 200, and errors keep their status", async (t) => {
  const authService = require("../src/modules/auth/auth.service");
  const ctl = require("../src/modules/auth/auth.controller");
  stubService(t, authService, {
    register: async () => ({ user: { role: "student" }, token: "t" }),
    login: async () => ({ user: { role: "student" }, token: "t" }),
    getUser: async () => ({ name: "A" })
  });
  assert.equal((await call(ctl.register, { body: { name: "A" } })).statusCode, 201);
  assert.equal((await call(ctl.login, { body: { email: "a@b.c" } })).statusCode, 200);
  assert.equal((await call(ctl.me, { user: { id: user } })).statusCode, 200);

  stubService(t, authService, {
    register: async () => { throw new authService.AuthError("exists", 409); },
    login: async () => { throw new authService.AuthError("wrong", 401); },
    getUser: async () => { throw new Error("db down"); }
  });
  assert.equal((await call(ctl.register, { body: undefined })).statusCode, 409);
  assert.equal((await call(ctl.login, { body: undefined })).statusCode, 401);
  assert.equal((await call(ctl.me, { user: { id: user } })).statusCode, 500);
});
