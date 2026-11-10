const analyticsService = require("./analytics.service");

async function getAnalytics(req, res) {
  try {
    const analytics = await analyticsService.getAnalytics();

    res.status(200).json({
      success: true,
      analytics
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
}

module.exports = {
  getAnalytics
};