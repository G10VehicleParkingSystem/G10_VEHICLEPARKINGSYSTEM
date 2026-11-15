const express = require("express");
const { requireAdmin, ownUserParam } = require("../auth/auth.middleware");
const {
  detectOverstays,
  getFines,
  checkout
} = require("./overstay.controller");

const router = express.Router();

router.param("userId", ownUserParam);

router.post("/detect", requireAdmin, detectOverstays);
router.get("/my/:userId", getFines);
router.post("/:reservationId/checkout", checkout);

module.exports = router;