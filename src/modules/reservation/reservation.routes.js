const express = require("express");
const { ownUserParam } = require("../auth/auth.middleware");

const {
  createReservation,
  getMyReservations,
  cancelReservation
} = require("./reservation.controller");

const router = express.Router();

router.param("userId", ownUserParam);

router.post("/", createReservation);
router.get("/my/:userId", getMyReservations);
router.delete("/:id", cancelReservation);

module.exports = router;
