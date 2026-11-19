const authService = require("./auth.service");

function fail(res, error) {
  const status = error instanceof authService.AuthError ? error.status : 500;
  return res.status(status).json({ success: false, message: error.message });
}

async function register(req, res) {
  try {
    const { name, email, password, role, detail } = req.body || {};
    const result = await authService.register({ name, email, password, role, detail });
    return res.status(201).json({ success: true, message: "Account created", ...result });
  } catch (error) {
    return fail(res, error);
  }
}

async function login(req, res) {
  try {
    const { email, password } = req.body || {};
    const result = await authService.login({ email, password });
    return res.json({ success: true, message: "Signed in", ...result });
  } catch (error) {
    return fail(res, error);
  }
}

async function me(req, res) {
  try {
    const user = await authService.getUser(req.user.id);
    return res.json({ success: true, user });
  } catch (error) {
    return fail(res, error);
  }
}

module.exports = {
  register,
  login,
  me
};
