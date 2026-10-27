const express = require("express");
const {
  createSlot,
  getSlots,
  recommendSlot
} = require("./slot.controller");

const router = express.Router();

router.post("/", createSlot);
router.get("/", getSlots);
router.post("/recommend", recommendSlot);

module.exports = router;
