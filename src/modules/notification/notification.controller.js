const notificationService = require("./notification.service");

async function createNotification(req, res) {
  try {
    const {
      userId,
      type,
      title,
      message,
      relatedId
    } = req.body;

    if (!userId || !type || !title || !message) {
      return res.status(400).json({
        success: false,
        message: "userId, type, title and message are required"
      });
    }

    const notification =
      await notificationService.createNotification({
        userId,
        type,
        title,
        message,
        relatedId
      });

    res.status(201).json({
      success: true,
      notification
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
}

async function getNotifications(req, res) {
  try {
    const notifications =
      await notificationService.getUserNotifications(
        req.params.userId
      );

    res.json({
      success: true,
      notifications
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
}

async function markNotificationAsRead(req, res) {
  try {
    const notification =
      await notificationService.markAsRead(
        req.params.id,
        req.query.userId
      );

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: "Notification not found"
      });
    }

    res.json({
      success: true,
      notification
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
}

module.exports = {
  createNotification,
  getNotifications,
  markNotificationAsRead
};
