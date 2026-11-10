
const mongoose = require("mongoose");
const Review = require("./review.model");
const Reservation = require("../reservation/reservation.model");
const ParkingSession = require("../parking/parking.model");

async function createReview({ userId, reservationId, rating, review }) {
  // Verify reservation belongs to the supplied user
  const reservation = await Reservation.findOne({
    _id: reservationId,
    userId
  });

  if (!reservation) {
    throw new Error("Reservation not found for this user");
  }

  // Verify that the user has completed the parking session
  const session = await ParkingSession.findOne({
    reservationId,
    userId,
    status: "COMPLETED"
  });

  if (!session) {
    throw new Error("Review allowed only after completed parking");
  }

  // Create review using the actual slot from the parking session
  return Review.create({
    userId,
    reservationId,
    slotId: session.slotId,
    rating,
    review: review || ""
  });
}

async function getReviewsBySlot(slotId) {
  return Review.find({ slotId })
    .sort({ createdAt: -1 })
    .lean();
}

async function getReviewsByUser(userId) {
  return Review.find({ userId })
    .sort({ createdAt: -1 })
    .lean();
}

async function updateReview(reviewId, userId, data) {
  return Review.findOneAndUpdate(
    {
      _id: reviewId,
      userId
    },
    {
      rating: data.rating,
      review: data.review
    },
    {
      new: true,
      runValidators: true
    }
  );
}

async function deleteReview(reviewId, userId) {
  return Review.findOneAndDelete({
    _id: reviewId,
    userId
  });
}

async function getSlotRating(slotId) {
  const result = await Review.aggregate([
    {
      $match: {
        slotId: new mongoose.Types.ObjectId(slotId)
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

  if (result.length === 0) {
    return {
      averageRating: 0,
      totalReviews: 0
    };
  }

  return {
    averageRating: Number(result[0].averageRating.toFixed(2)),
    totalReviews: result[0].totalReviews
  };
}

module.exports = {
  createReview,
  getReviewsBySlot,
  getReviewsByUser,
  updateReview,
  deleteReview,
  getSlotRating
};
