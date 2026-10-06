const slotService = require("./slot.service");

async function recommendSlot(req, res) {
  try {
    const { vehicleNumber } = req.body;

    if (!vehicleNumber) {
      return res.status(400).json({
        success: false,
        message: "vehicleNumber is required"
      });
    }

    const slot = await slotService.recommendSlot(vehicleNumber);

    return res.status(200).json({
      success: true,
      message: "Suitable parking slot found",
      slot
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message
    });
  }
}

module.exports = {
  recommendSlot
};