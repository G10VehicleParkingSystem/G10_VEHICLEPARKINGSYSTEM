const slotService = require("./slot.service");

async function createSlot(req, res) {
  try {
    const slot = await slotService.createSlot(req.body);

    return res.status(201).json({
      success: true,
      message: "Parking slot created successfully",
      slot
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message
    });
  }
}

async function getSlots(req, res) {
  try {
    const slots = await slotService.getSlots(req.query.status);

    return res.status(200).json({
      success: true,
      slots
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
}

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
  createSlot,
  getSlots,
  recommendSlot
};
