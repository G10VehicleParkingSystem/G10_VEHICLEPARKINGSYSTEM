const express = require("express");
const { ownUserParam } = require("../auth/auth.middleware");
const {
  payForReservation,
  payFine,
  getTransactions
} = require("./payment.controller");

const router = express.Router();

router.param("userId", ownUserParam);

router.post("/reservations/:reservationId", payForReservation);
router.post("/fines/:fineId", payFine);
router.get("/my/:userId", getTransactions);

module.exports = router;