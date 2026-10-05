const overstayService = require("./overstay.service");

async function detectOverstays(req, res) {
  try {
    const result = await overstayService.detectOverstays();
    return res.json({ success: true, ...result });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

async function getFines(req, res) {
  try {
    const fines = await overstayService.getUserFines(req.params.userId);
    return res.json({ success: true, fines });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

async function checkout(req, res) {
  try {
    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "userId is required"
      });
    }

    const result = await overstayService.checkout({
      reservationId: req.params.reservationId,
      userId
    });
    return res.json({
      success: true,
      message: "Parking session checked out",
      ...result
    });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
}

module.exports = { detectOverstays, getFines, checkout };