const express = require("express");
const { requireAdmin, ownUserParam } = require("../auth/auth.middleware");

const {
  createNotification,
  getNotifications,
  markNotificationAsRead
} = require("./notification.controller");

const router = express.Router();

router.param("userId", ownUserParam);

router.post("/", requireAdmin, createNotification);
router.get("/:userId", getNotifications);
router.patch("/:id/read", markNotificationAsRead);

module.exports = router;
