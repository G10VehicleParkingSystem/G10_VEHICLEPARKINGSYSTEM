const express = require("express");

const {
  createNotification,
  getNotifications,
  markNotificationAsRead
} = require("./notification.controller");

const router = express.Router();

router.post("/", createNotification);
router.get("/:userId", getNotifications);
router.patch("/:id/read", markNotificationAsRead);

module.exports = router;
