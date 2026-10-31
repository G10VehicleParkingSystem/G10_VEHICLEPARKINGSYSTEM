
const reviewService = require("./review.service");

const isValidId = (id) =>
  typeof id === "string" &&
  /^[a-fA-F0-9]{24}$/.test(id);

async function createReview(req, res) {
  try {
    const { userId, reservationId, rating, review } = req.body;

    if (!isValidId(userId) || !isValidId(reservationId)) {
      return res.status(400).json({
        success: false,
        message: "Valid userId and reservationId are required"
      });
    }

    if (
      !Number.isInteger(rating) ||
      rating < 1 ||
      rating > 5
    ) {
      return res.status(400).json({
        success: false,
        message: "Rating must be an integer between 1 and 5"
      });
    }

    if (
      review !== undefined &&
      (typeof review !== "string" || review.length > 500)
    ) {
      return res.status(400).json({
        success: false,
        message: "Review must be text with a maximum of 500 characters"
      });
    }

    const result = await reviewService.createReview({
      userId,
      reservationId,
      rating,
      review
    });

    return res.status(201).json({
      success: true,
      message: "Review submitted successfully",
      data: result
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "A review already exists for this reservation"
      });
    }

    return res.status(400).json({
      success: false,
      message: error.message
    });
  }
}

async function getReviewsBySlot(req, res) {
  try {
    const { slotId } = req.params;

    if (!isValidId(slotId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid slot ID"
      });
    }

    const reviews = await reviewService.getReviewsBySlot(slotId);
    const rating = await reviewService.getSlotRating(slotId);

    return res.status(200).json({
      success: true,
      data: reviews,
      rating
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Unable to fetch reviews"
    });
  }
}

async function getReviewsByUser(req, res) {
  try {
    const { userId } = req.params;

    if (!isValidId(userId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID"
      });
    }

    const reviews = await reviewService.getReviewsByUser(userId);

    return res.status(200).json({
      success: true,
      data: reviews
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Unable to fetch user reviews"
    });
  }
}

async function updateReview(req, res) {
  try {
    const { id } = req.params;
    const { userId, rating, review } = req.body;

    if (!isValidId(id) || !isValidId(userId)) {
      return res.status(400).json({
        success: false,
        message: "Valid review ID and user ID are required"
      });
    }

    if (
      !Number.isInteger(rating) ||
      rating < 1 ||
      rating > 5
    ) {
      return res.status(400).json({
        success: false,
        message: "Rating must be an integer between 1 and 5"
      });
    }

    if (
      review !== undefined &&
      (typeof review !== "string" || review.length > 500)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid review text"
      });
    }

    const updated = await reviewService.updateReview(
      id,
      userId,
      {
        rating,
        review: review || ""
      }
    );

    if (!updated) {
      return res.status(404).json({
        success: false,
        message: "Review not found for this user"
      });
    }

    return res.status(200).json({
      success: true,
      message: "Review updated successfully",
      data: updated
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message
    });
  }
}

async function deleteReview(req, res) {
  try {
    const { id } = req.params;
    const { userId } = req.query;

    if (!isValidId(id) || !isValidId(userId)) {
      return res.status(400).json({
        success: false,
        message: "Valid review ID and user ID are required"
      });
    }

    const deleted = await reviewService.deleteReview(id, userId);

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: "Review not found for this user"
      });
    }

    return res.status(200).json({
      success: true,
      message: "Review deleted successfully"
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Unable to delete review"
    });
  }
}

module.exports = {
  createReview,
  getReviewsBySlot,
  getReviewsByUser,
  updateReview,
  deleteReview
};
