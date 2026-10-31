
const express = require("express");

const {
  createReview,
  getReviewsBySlot,
  getReviewsByUser,
  updateReview,
  deleteReview
} = require("./review.controller");

const router = express.Router();

// Submit a review
router.post("/", createReview);

// View reviews for a parking slot
router.get("/slot/:slotId", getReviewsBySlot);

// View reviews submitted by a user
router.get("/user/:userId", getReviewsByUser);

// Update own review (userId supplied in request body)
router.patch("/:id", updateReview);

// Delete own review (userId supplied as query parameter)
router.delete("/:id", deleteReview);

module.exports = router;
