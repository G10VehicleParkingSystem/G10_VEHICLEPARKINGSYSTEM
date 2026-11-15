const test = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

const User = require("../src/modules/auth/user.model");
const authService = require("../src/modules/auth/auth.service");
const { requireAuth, requireAdmin, bindUser, ownUserParam } = require("../src/modules/auth/auth.middleware");
const { createResponse, stubModel, id } = require("./helpers/test-utils");

function signedInRequest(user, extra = {}) {
  const token = authService.signToken(user);
  return { headers: { authorization: `Bearer ${token}` }, body: {}, query: {}, ...extra };
}

test("NFR security: register stores a bcrypt hash, never the password", async (t) => {
  let saved;
  stubModel(t, User, {
    findOne: async () => null,
    create: async (data) => (saved = { _id: id(), ...data })
  });

  const result = await authService.register({
    name: "Ananya Rao", email: "Ananya@College.edu", password: "library-lane", detail: "3rd year, CSE"
  });

  assert.equal(saved.email, "ananya@college.edu");
  assert.notEqual(saved.passwordHash, "library-lane");
  assert.ok(await bcrypt.compare("library-lane", saved.passwordHash));
  assert.equal(result.user.role, "student");
  assert.equal(result.user.passwordHash, undefined);
  assert.equal(authService.verifyToken(result.token).id, String(saved._id));
});

test("NFR security: sign-up cannot create an admin account", async (t) => {
  stubModel(t, User, { findOne: async () => null });
  await assert.rejects(
    authService.register({ name: "X", email: "x@college.edu", password: "password123", role: "admin" }),
    /student or faculty/
  );
});

test("NFR security: short passwords and duplicate emails are refused", async (t) => {
  stubModel(t, User, { findOne: async () => ({ _id: id() }) });
  await assert.rejects(
    authService.register({ name: "X", email: "x@college.edu", password: "short" }),
    /at least 8/
  );
  await assert.rejects(
    authService.register({ name: "X", email: "x@college.edu", password: "password123" }),
    (error) => error.status === 409
  );
});

test("NFR security: login checks the password against the hash", async (t) => {
  const user = { _id: id(), name: "Rahul", email: "rahul@college.edu", role: "student",
    passwordHash: await bcrypt.hash("right-password", 4) };
  stubModel(t, User, { findOne: () => ({ select: async () => user }) });

  const ok = await authService.login({ email: "RAHUL@college.edu", password: "right-password" });
  assert.equal(authService.verifyToken(ok.token).role, "student");

  await assert.rejects(
    authService.login({ email: "rahul@college.edu", password: "wrong-password" }),
    (error) => error.status === 401 && /incorrect/.test(error.message)
  );
});

test("NFR security: requests without a valid token get 401", () => {
  for (const authorization of [undefined, "Bearer", "Bearer not-a-token", "Basic abc"]) {
    const res = createResponse();
    let passed = false;
    requireAuth({ headers: { authorization } }, res, () => (passed = true));
    assert.equal(passed, false);
    assert.equal(res.statusCode, 401);
  }
});

test("NFR security: the user id comes from the token, not the request", () => {
  const me = { _id: id(), name: "Ananya", role: "student" };
  const someoneElse = String(id());
  const req = signedInRequest(me, { body: { userId: someoneElse }, query: { userId: someoneElse } });

  requireAuth(req, createResponse(), () => bindUser(req, createResponse(), () => {}));

  assert.equal(req.body.userId, String(me._id));
  assert.equal(req.query.userId, String(me._id));
});

test("NFR security: students only see their own records, the office sees anyone's", () => {
  const student = { _id: id(), name: "Ananya", role: "student" };
  const office = { _id: id(), name: "Office", role: "admin" };
  const other = String(id());

  const studentReq = signedInRequest(student);
  requireAuth(studentReq, createResponse(), () => {});
  const denied = createResponse();
  let passed = false;
  ownUserParam(studentReq, denied, () => (passed = true), other);
  assert.equal(passed, false);
  assert.equal(denied.statusCode, 403);

  ownUserParam(studentReq, createResponse(), () => (passed = true), String(student._id));
  assert.equal(passed, true);

  const officeReq = signedInRequest(office, { body: { userId: other } });
  requireAuth(officeReq, createResponse(), () => {});
  bindUser(officeReq, createResponse(), () => {});
  assert.equal(officeReq.body.userId, other);
  let officePassed = false;
  ownUserParam(officeReq, createResponse(), () => (officePassed = true), other);
  assert.equal(officePassed, true);
});

test("NFR security: admin-only actions refuse students", () => {
  const studentReq = signedInRequest({ _id: id(), name: "Rahul", role: "student" });
  requireAuth(studentReq, createResponse(), () => {});
  const res = createResponse();
  let passed = false;
  requireAdmin(studentReq, res, () => (passed = true));
  assert.equal(passed, false);
  assert.equal(res.statusCode, 403);

  const officeReq = signedInRequest({ _id: id(), name: "Office", role: "admin" });
  requireAuth(officeReq, createResponse(), () => {});
  requireAdmin(officeReq, createResponse(), () => (passed = true));
  assert.equal(passed, true);
});
