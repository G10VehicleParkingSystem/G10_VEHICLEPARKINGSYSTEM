const express = require("express");

const {
  createReview,
  getReviewsByLocation,
  getReviewsByUser,
  updateReview,
  deleteReview,
  getAllReviews,
  deleteReviewByAdmin
} = require("./review.controller");

const router = express.Router();

// User routes
router.post("/", createReview);
router.get("/user", getReviewsByUser);
router.get("/location/:locationId", getReviewsByLocation);
router.patch("/:id", updateReview);
router.delete("/:id", deleteReview);

// Admin routes
router.get("/admin/all", getAllReviews);
router.delete("/admin/:id", deleteReviewByAdmin);

module.exports = router;