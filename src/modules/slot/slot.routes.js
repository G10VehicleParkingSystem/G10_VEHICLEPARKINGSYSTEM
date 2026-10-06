const express = require("express");
const { recommendSlot } = require("./slot.controller");

const router = express.Router();

router.post("/recommend", recommendSlot);

module.exports = router;
