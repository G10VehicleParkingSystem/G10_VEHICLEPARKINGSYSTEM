const express = require("express");
const { requireAdmin } = require("../auth/auth.middleware");
const {
  createSlot,
  getSlots,
  recommendSlot
} = require("./slot.controller");

const router = express.Router();

router.post("/", requireAdmin, createSlot);
router.get("/", getSlots);
router.post("/recommend", recommendSlot);

module.exports = router;
