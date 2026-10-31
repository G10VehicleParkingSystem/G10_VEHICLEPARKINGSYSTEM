const service = require("./review.service");

const isValidId = (id) =>
  /^[a-f\d]{24}$/i.test(String(id || ""));

const createReview = async (req, res) => {
  try {
    const userId = req.user?._id || req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required"
      });
    }

    const { reservationId, parkingLocationId, rating, review } = req.body;

    if (
      !isValidId(reservationId) ||
      !isValidId(parkingLocationId) ||
      !Number.isInteger(rating) ||
      rating < 1 ||
      rating > 5
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid reservation, location or rating"
      });
    }

    if (review && typeof review !== "string") {
      return res.status(400).json({
        success: false,
        message: "Review must be text"
      });
    }

    if (review && review.length > 500) {
      return res.status(400).json({
        success: false,
        message: "Review cannot exceed 500 characters"
      });
    }

    const result = await service.createReview({
      userId,
      reservationId,
      parkingLocationId,
      rating,
      review: review || ""
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

    return res.status(500).json({
      success: false,
      message: "Unable to submit review"
    });
  }
};

const getReviewsByLocation = async (req, res) => {
  try {
    if (!isValidId(req.params.locationId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid location ID"
      });
    }

    const reviews = await service.getReviewsByLocation(
      req.params.locationId
    );

    const rating = await service.getLocationRating(
      req.params.locationId
    );

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
};

const getReviewsByUser = async (req, res) => {
  try {
    const userId = req.user?._id || req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required"
      });
    }

    const reviews = await service.getReviewsByUser(userId);

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
};

const updateReview = async (req, res) => {
  try {
    const userId = req.user?._id || req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required"
      });
    }

    const { rating, review } = req.body;

    if (!isValidId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid review ID"
      });
    }

    if (
      !Number.isInteger(rating) ||
      rating < 1 ||
      rating > 5 ||
      (review !== undefined &&
        (typeof review !== "string" || review.length > 500))
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid rating or review"
      });
    }

    const updated = await service.updateReview(
      req.params.id,
      userId,
      { rating, review: review || "" }
    );

    if (!updated) {
      return res.status(404).json({
        success: false,
        message: "Review not found or not owned by you"
      });
    }

    return res.status(200).json({
      success: true,
      message: "Review updated successfully",
      data: updated
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Unable to update review"
    });
  }
};

const deleteReview = async (req, res) => {
  try {
    const userId = req.user?._id || req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required"
      });
    }

    if (!isValidId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid review ID"
      });
    }

    const deleted = await service.deleteReview(
      req.params.id,
      userId
    );

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: "Review not found or not owned by you"
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
};

const getAllReviews = async (req, res) => {
  try {
    const reviews = await service.getAllReviews();

    return res.status(200).json({
      success: true,
      data: reviews
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Unable to fetch reviews"
    });
  }
};

const deleteReviewByAdmin = async (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid review ID"
      });
    }

    const deleted = await service.deleteReviewByAdmin(
      req.params.id
    );

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: "Review not found"
      });
    }

    return res.status(200).json({
      success: true,
      message: "Review removed successfully"
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Unable to delete review"
    });
  }
};

module.exports = {
  createReview,
  getReviewsByLocation,
  getReviewsByUser,
  updateReview,
  deleteReview,
  getAllReviews,
  deleteReviewByAdmin
};