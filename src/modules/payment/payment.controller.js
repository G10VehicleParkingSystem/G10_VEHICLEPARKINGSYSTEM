const paymentService = require("./payment.service");

async function payForReservation(req, res) {
  try {
    const { userId, paymentMethod } = req.body;
    if (!userId || !paymentMethod) {
      return res.status(400).json({
        success: false,
        message: "userId and paymentMethod are required"
      });
    }

    const payment = await paymentService.payForReservation({
      reservationId: req.params.reservationId,
      userId,
      paymentMethod
    });

    return res.status(201).json({ success: true, payment });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
}

async function payFine(req, res) {
  try {
    const { userId, paymentMethod } = req.body;
    if (!userId || !paymentMethod) {
      return res.status(400).json({
        success: false,
        message: "userId and paymentMethod are required"
      });
    }

    const payment = await paymentService.payFine({
      fineId: req.params.fineId,
      userId,
      paymentMethod
    });

    return res.status(201).json({ success: true, payment });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
}

async function getTransactions(req, res) {
  try {
    const transactions = await paymentService.getUserTransactions(
      req.params.userId
    );
    return res.json({ success: true, transactions });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

module.exports = { payForReservation, payFine, getTransactions };