const Review = require("./review.model");

const createReview = async (data) => {
  return await Review.create(data);
};

const getReviewsByLocation = async (locationId) => {
  return await Review.find({
    parkingLocationId: locationId
  })
    .sort({ createdAt: -1 })
    .populate("userId", "name")
    .lean();
};

const getReviewsByUser = async (userId) => {
  return await Review.find({ userId })
    .sort({ createdAt: -1 })
    .lean();
};

const updateReview = async (reviewId, userId, data) => {
  return await Review.findOneAndUpdate(
    { _id: reviewId, userId },
    {
      rating: data.rating,
      review: data.review
    },
    {
      new: true,
      runValidators: true
    }
  );
};

const deleteReview = async (reviewId, userId) => {
  return await Review.findOneAndDelete({
    _id: reviewId,
    userId
  });
};

const getAllReviews = async () => {
  return await Review.find()
    .sort({ createdAt: -1 })
    .populate("userId", "name")
    .lean();
};

const deleteReviewByAdmin = async (reviewId) => {
  return await Review.findByIdAndDelete(reviewId);
};

const getLocationRating = async (locationId) => {
  const result = await Review.aggregate([
    {
      $match: {
        parkingLocationId: require("mongoose").Types.ObjectId.createFromHexString(
          locationId
        )
      }
    },
    {
      $group: {
        _id: null,
        averageRating: { $avg: "$rating" },
        totalReviews: { $sum: 1 }
      }
    }
  ]);

  return result.length
    ? result[0]
    : { averageRating: 0, totalReviews: 0 };
};

module.exports = {
  createReview,
  getReviewsByLocation,
  getReviewsByUser,
  updateReview,
  deleteReview,
  getAllReviews,
  deleteReviewByAdmin,
  getLocationRating
};