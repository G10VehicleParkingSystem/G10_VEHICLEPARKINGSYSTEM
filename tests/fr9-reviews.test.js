
const test = require("node:test");
const assert = require("node:assert/strict");

const Review = require("../src/modules/review/review.model");
const Reservation = require("../src/modules/reservation/reservation.model");
const ParkingSession = require("../src/modules/parking/parking.model");

const reviewService = require("../src/modules/review/review.service");
const reviewController = require("../src/modules/review/review.controller");

const {
  createResponse,
  stubModel,
  id
} = require("./helpers/test-utils");

function reviewInput(overrides = {}) {
  return {
    userId: id().toString(),
    reservationId: id().toString(),
    rating: 5,
    review: "Clean parking area and helpful staff.",
    ...overrides
  };
}

// 1. Successful review creation
test("review is created after a completed parking session", async (t) => {
  const input = reviewInput();
  const slotId = id();
  let createdReview;

  stubModel(t, Reservation, {
    findOne: async (filter) => {
      assert.equal(filter._id, input.reservationId);
      assert.equal(filter.userId, input.userId);
      return { _id: input.reservationId };
    }
  });

  stubModel(t, ParkingSession, {
    findOne: async (filter) => {
      assert.equal(filter.status, "COMPLETED");
      return { slotId };
    }
  });

  stubModel(t, Review, {
    create: async (data) => {
      createdReview = { _id: id(), ...data };
      return createdReview;
    }
  });

  const result = await reviewService.createReview(input);

  assert.equal(result.rating, 5);
  assert.equal(result.userId, input.userId);
  assert.equal(result.reservationId, input.reservationId);
  assert.equal(result.slotId.toString(), slotId.toString());
  assert.equal(createdReview.review, input.review);
});

// 2. Reject review for nonexistent reservation
test("review rejects reservation not belonging to the user", async (t) => {
  const input = reviewInput();

  stubModel(t, Reservation, {
    findOne: async () => null
  });

  await assert.rejects(
    () => reviewService.createReview(input),
    /Reservation not found for this user/
  );
});

// 3. Reject review before parking completion
test("review is rejected when parking session is not completed", async (t) => {
  const input = reviewInput();

  stubModel(t, Reservation, {
    findOne: async () => ({ _id: input.reservationId })
  });

  stubModel(t, ParkingSession, {
    findOne: async (filter) => {
      assert.equal(filter.status, "COMPLETED");
      return null;
    }
  });

  await assert.rejects(
    () => reviewService.createReview(input),
    /Review allowed only after completed parking/
  );
});

// 4. Retrieve reviews by parking slot
test("reviews are retrieved using the correct slot ID", async (t) => {
  const slotId = id().toString();
  const expectedReviews = [
    { rating: 5, review: "Excellent parking" },
    { rating: 4, review: "Good experience" }
  ];

  let capturedFilter;
  let capturedSort;

  stubModel(t, Review, {
    find: (filter) => {
      capturedFilter = filter;

      return {
        sort: (sort) => {
          capturedSort = sort;

          return {
            lean: async () => expectedReviews
          };
        }
      };
    }
  });

  const result = await reviewService.getReviewsBySlot(slotId);

  assert.equal(capturedFilter.slotId, slotId);
  assert.deepEqual(capturedSort, { createdAt: -1 });
  assert.deepEqual(result, expectedReviews);
});

// 5. Retrieve reviews by user
test("reviews are retrieved using the correct user ID", async (t) => {
  const userId = id().toString();
  const expectedReviews = [{ rating: 5, review: "Great experience" }];

  let capturedFilter;

  stubModel(t, Review, {
    find: (filter) => {
      capturedFilter = filter;

      return {
        sort: () => ({
          lean: async () => expectedReviews
        })
      };
    }
  });

  const result = await reviewService.getReviewsByUser(userId);

  assert.equal(capturedFilter.userId, userId);
  assert.deepEqual(result, expectedReviews);
});

// 6. Update review
test("review is updated with the correct user ownership filter", async (t) => {
  const reviewId = id().toString();
  const userId = id().toString();

  const updatedReview = {
    _id: reviewId,
    userId,
    rating: 4,
    review: "Updated parking experience"
  };

  let capturedFilter;
  let capturedUpdate;
  let capturedOptions;

  stubModel(t, Review, {
    findOneAndUpdate: async (filter, update, options) => {
      capturedFilter = filter;
      capturedUpdate = update;
      capturedOptions = options;
      return updatedReview;
    }
  });

  const result = await reviewService.updateReview(
    reviewId,
    userId,
    { rating: 4, review: "Updated parking experience" }
  );

  assert.equal(capturedFilter._id, reviewId);
  assert.equal(capturedFilter.userId, userId);
  assert.equal(capturedUpdate.rating, 4);
  assert.deepEqual(capturedOptions, {
    new: true,
    runValidators: true
  });
  assert.equal(result.rating, 4);
});

// 7. Delete review
test("review deletion uses the correct user ownership filter", async (t) => {
  const reviewId = id().toString();
  const userId = id().toString();

  let capturedFilter;

  stubModel(t, Review, {
    findOneAndDelete: async (filter) => {
      capturedFilter = filter;
      return { _id: reviewId, userId };
    }
  });

  const result = await reviewService.deleteReview(reviewId, userId);

  assert.equal(capturedFilter._id, reviewId);
  assert.equal(capturedFilter.userId, userId);
  assert.equal(result._id, reviewId);
});

// 8. Calculate average slot rating
test("slot rating calculates average and total review count", async (t) => {
  const slotId = id().toString();

  stubModel(t, Review, {
    aggregate: async (pipeline) => {
      assert.equal(
        pipeline[0].$match.slotId.toString(),
        slotId
      );

      return [{
        averageRating: 4.333,
        totalReviews: 3
      }];
    }
  });

  const result = await reviewService.getSlotRating(slotId);

  assert.deepEqual(result, {
    averageRating: 4.33,
    totalReviews: 3
  });
});

// 9. Handle slot with no reviews
test("slot rating returns zero when no reviews exist", async (t) => {
  stubModel(t, Review, {
    aggregate: async () => []
  });

  const result = await reviewService.getSlotRating(id().toString());

  assert.deepEqual(result, {
    averageRating: 0,
    totalReviews: 0
  });
});

// 10. Controller rejects decimal ratings
test("review controller rejects decimal ratings", async () => {
  const input = reviewInput({ rating: 4.5 });
  const res = createResponse();

  await reviewController.createReview(
    { body: input },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.match(res.body.message, /integer between 1 and 5/);
});

// 11. Controller maps duplicate review errors to HTTP 409
test("duplicate review error returns HTTP 409", async (t) => {
  const originalCreateReview = reviewService.createReview;

  reviewService.createReview = async () => {
    const error = new Error("Duplicate review");
    error.code = 11000;
    throw error;
  };

  t.after(() => {
    reviewService.createReview = originalCreateReview;
  });

  const res = createResponse();

  await reviewController.createReview(
    { body: reviewInput() },
    res
  );

  assert.equal(res.statusCode, 409);
  assert.match(res.body.message, /already exists/);
});
