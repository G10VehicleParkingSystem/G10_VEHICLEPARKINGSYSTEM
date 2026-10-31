
const subscriptionService = require("./subscription.service");

async function getMonthlyPlan(req, res) {
  try {
    return res.status(200).json({
      success: true,
      plan: subscriptionService.getMonthlyPlan()
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message
    });
  }
}

async function createSubscription(req, res) {
  try {
    const { userId, vehicleId, slotId, paymentMethod } = req.body;

    if (!userId || !vehicleId || !slotId || !paymentMethod) {
      return res.status(400).json({
        success: false,
        message: "userId, vehicleId, slotId and paymentMethod are required"
      });
    }

    const result = await subscriptionService.createSubscription({
      userId,
      vehicleId,
      slotId,
      paymentMethod
    });

    return res.status(201).json({
      success: true,
      message: "Monthly parking subscription activated successfully",
      ...result
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message
    });
  }
}

async function getMySubscriptions(req, res) {
  try {
    const subscriptions =
      await subscriptionService.getUserSubscriptions(req.params.userId);

    return res.status(200).json({
      success: true,
      subscriptions
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message
    });
  }
}

async function renewSubscription(req, res) {
  try {
    const { userId, paymentMethod } = req.body;

    if (!userId || !paymentMethod) {
      return res.status(400).json({
        success: false,
        message: "userId and paymentMethod are required"
      });
    }

    const result = await subscriptionService.renewSubscription({
      subscriptionId: req.params.id,
      userId,
      paymentMethod
    });

    return res.status(201).json({
      success: true,
      message: "Subscription renewed successfully",
      ...result
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message
    });
  }
}

async function cancelSubscription(req, res) {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "userId is required"
      });
    }

    const subscription = await subscriptionService.cancelSubscription({
      subscriptionId: req.params.id,
      userId
    });

    return res.status(200).json({
      success: true,
      message: "Subscription scheduled for cancellation at period end",
      subscription
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message
    });
  }
}

module.exports = {
  getMonthlyPlan,
  createSubscription,
  getMySubscriptions,
  renewSubscription,
  cancelSubscription
};
