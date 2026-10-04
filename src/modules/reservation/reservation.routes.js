const express = require("express");

const {
  createReservation,
  getMyReservations,
  cancelReservation
} = require("./reservation.controller");

const router = express.Router();

router.post("/", createReservation);
router.get("/my/:userId", getMyReservations);
router.delete("/:id", cancelReservation);

module.exports = router;
