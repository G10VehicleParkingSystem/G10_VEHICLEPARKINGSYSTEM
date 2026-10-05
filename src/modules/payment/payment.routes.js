const express = require("express");
const {
  payForReservation,
  payFine,
  getTransactions
} = require("./payment.controller");

const router = express.Router();

router.post("/reservations/:reservationId", payForReservation);
router.post("/fines/:fineId", payFine);
router.get("/my/:userId", getTransactions);

module.exports = router;