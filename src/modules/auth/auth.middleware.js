const { verifyToken } = require("./auth.service");

function deny(res, status, message) {
  return res.status(status).json({ success: false, message });
}

// Requires "Authorization: Bearer <token>" and sets req.user = { id, name, role }.
function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const [scheme, token] = header.split(" ");

  if (scheme !== "Bearer" || !token) {
    return deny(res, 401, "Please sign in first");
  }

  try {
    req.user = verifyToken(token);
    return next();
  } catch {
    return deny(res, 401, "Your sign-in has expired, please sign in again");
  }
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== "admin") {
    return deny(res, 403, "Only the parking office can do this");
  }
  return next();
}

// Replaces the old userId request parameters (deviation D-1): the user always comes
// from the token. Students and faculty act as themselves whatever they send; the
// parking office may name another user and defaults to itself.
function bindUser(req, res, next) {
  const isAdmin = req.user.role === "admin";

  if (req.body && typeof req.body === "object" && !Array.isArray(req.body)) {
    if (!isAdmin || !req.body.userId) req.body.userId = req.user.id;
  }
  if (!isAdmin || !req.query.userId) req.query.userId = req.user.id;

  return next();
}

// router.param("userId", ownUserParam): /my/:userId style routes only show your own data.
function ownUserParam(req, res, next, userId) {
  if (req.user.role !== "admin" && userId !== req.user.id) {
    return deny(res, 403, "You can only see your own records");
  }
  return next();
}

module.exports = {
  requireAuth,
  requireAdmin,
  bindUser,
  ownUserParam
};
