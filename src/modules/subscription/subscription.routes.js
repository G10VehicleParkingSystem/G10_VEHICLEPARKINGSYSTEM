
const express = require("express");

const {
  getMonthlyPlan,
  createSubscription,
  getMySubscriptions,
  renewSubscription,
  cancelSubscription
} = require("./subscription.controller");

const router = express.Router();

router.get("/plans", getMonthlyPlan);
router.post("/", createSubscription);
router.get("/my/:userId", getMySubscriptions);
router.post("/:id/renew", renewSubscription);
router.patch("/:id/cancel", cancelSubscription);

module.exports = router;
