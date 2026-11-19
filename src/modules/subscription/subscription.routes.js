
const express = require("express");
const { ownUserParam } = require("../auth/auth.middleware");

const {
  getMonthlyPlan,
  createSubscription,
  getMySubscriptions,
  renewSubscription,
  cancelSubscription
} = require("./subscription.controller");

const router = express.Router();

router.param("userId", ownUserParam);

router.get("/plans", getMonthlyPlan);
router.post("/", createSubscription);
router.get("/my/:userId", getMySubscriptions);
router.post("/:id/renew", renewSubscription);
router.patch("/:id/cancel", cancelSubscription);

module.exports = router;
