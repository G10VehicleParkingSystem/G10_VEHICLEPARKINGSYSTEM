const express = require("express");
const {
  detectOverstays,
  getFines,
  checkout
} = require("./overstay.controller");

const router = express.Router();

router.post("/detect", detectOverstays);
router.get("/my/:userId", getFines);
router.post("/:reservationId/checkout", checkout);

module.exports = router;