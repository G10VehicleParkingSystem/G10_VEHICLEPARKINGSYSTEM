const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("./user.model");

const SALT_ROUNDS = 10;
const TOKEN_LIFETIME = process.env.JWT_EXPIRES_IN || "7d";
const SELF_SERVICE_ROLES = ["student", "faculty"];
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

let generatedSecret;

// Tokens are signed with JWT_SECRET. Without it (local runs) a random secret is made
// at start-up, so everyone has to sign in again after a restart.
function secret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  if (!generatedSecret) {
    generatedSecret = crypto.randomBytes(32).toString("hex");
    if (process.env.NODE_ENV !== "test") {
      console.warn("JWT_SECRET is not set: using a random secret, sign-ins end when the server restarts.");
    }
  }
  return generatedSecret;
}

class AuthError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

function publicUser(user) {
  return {
    _id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    detail: user.detail || ""
  };
}

function signToken(user) {
  return jwt.sign({ name: user.name, role: user.role }, secret(), {
    subject: String(user._id),
    expiresIn: TOKEN_LIFETIME
  });
}

// Returns { id, name, role } for a valid token, or throws.
function verifyToken(token) {
  const payload = jwt.verify(token, secret());
  return { id: payload.sub, name: payload.name, role: payload.role };
}

function hashPassword(password) {
  return bcrypt.hash(password, SALT_ROUNDS);
}

function checkPassword(password) {
  if (typeof password !== "string" || password.length < 8) {
    throw new AuthError("Password must be at least 8 characters");
  }
  if (password.length > 72) {
    throw new AuthError("Password must be at most 72 characters");
  }
}

async function register({ name, email, password, role = "student", detail }) {
  if (typeof name !== "string" || !name.trim()) {
    throw new AuthError("Name is required");
  }
  if (typeof email !== "string" || !EMAIL_PATTERN.test(email.trim())) {
    throw new AuthError("A valid email is required");
  }
  checkPassword(password);
  // Admin accounts are never created through sign-up.
  if (!SELF_SERVICE_ROLES.includes(role)) {
    throw new AuthError("Role must be student or faculty");
  }

  const normalizedEmail = email.trim().toLowerCase();
  if (await User.findOne({ email: normalizedEmail })) {
    throw new AuthError("An account with this email already exists", 409);
  }

  const user = await User.create({
    name: name.trim(),
    email: normalizedEmail,
    passwordHash: await hashPassword(password),
    role,
    detail: typeof detail === "string" ? detail.trim() : undefined
  });

  return { user: publicUser(user), token: signToken(user) };
}

async function login({ email, password }) {
  if (typeof email !== "string" || typeof password !== "string") {
    throw new AuthError("Email and password are required");
  }

  const user = await User.findOne({ email: email.trim().toLowerCase() }).select("+passwordHash");
  // Same message for an unknown email and a wrong password.
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    throw new AuthError("Email or password is incorrect", 401);
  }

  return { user: publicUser(user), token: signToken(user) };
}

async function getUser(id) {
  const user = await User.findById(id);
  if (!user) throw new AuthError("Account not found", 404);
  return publicUser(user);
}

// Creates the parking office account from ADMIN_EMAIL / ADMIN_PASSWORD on start-up
// if it does not exist yet. Existing accounts are left alone.
async function ensureAdmin({ email, password, name = "Parking office" } = {}) {
  if (!email || !password) return null;
  checkPassword(password);

  const normalizedEmail = email.trim().toLowerCase();
  const existing = await User.findOne({ email: normalizedEmail });
  if (existing) return existing.role === "admin" ? existing : null;

  return User.create({
    name,
    email: normalizedEmail,
    passwordHash: await hashPassword(password),
    role: "admin",
    detail: "Admin"
  });
}

module.exports = {
  AuthError,
  register,
  login,
  getUser,
  ensureAdmin,
  signToken,
  verifyToken,
  hashPassword,
  publicUser
};
