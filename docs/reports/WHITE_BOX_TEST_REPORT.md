# White-Box Test Report

G10 Vehicle Parking System · generated on 2026-11-18 from commit `cdcd871`.

## 1. Purpose and approach

White-box (structural) testing designs test cases from the source code, so that every statement and every decision outcome runs at least once. The unit tests call the services and controllers directly and replace the Mongoose models with stubs (`tests/helpers/test-utils.js`). That way each branch can be forced: a database that returns nothing, a duplicate-key error, a payment gateway that fails, a lock that is busy.

Techniques used:

| Technique | How it was applied | Example tests |
|---|---|---|
| Statement coverage | Every statement in the services and controllers runs at least once | whole suite, see coverage below |
| Branch (decision) coverage | Each `if`, `try`/`catch` and short-circuit is driven both ways | `WB-PRK-01`..`08`, `WB-CTL` table |
| Condition coverage | Multi-part input checks, such as `!userId \|\| !paymentMethod` and the rating range, are tested one condition at a time | `WB-CTL payment.payForReservation`, `WB-CTL review.updateReview` |
| Basis path testing | One test per independent path through the most complex functions (section 3) | `WB-PAY-01`..`07`, `WB-PRK-01`..`04` |
| Loop testing | Loops run 0, 1 and many times: the overstay scan, and the booking-lock retry loop until it gives up | `WB-OVR-01`..`03`, `WB-RES-04`..`06` |
| Boundary values on internals | Billing rounds up each started hour, a booking ending exactly *now* is not fined, password length 7/8/72/73 | `WB-OVR-03`, `WB-AUT-01`, `payment-calculations` |
| Error-path / fault injection | Stubs throw to check rollbacks: the slot is freed when a session cannot be saved, the pass is set to PAYMENT_FAILED when payment fails | `WB-PRK-04`, `WB-PRK-06`, `WB-SUB-03` |

## 2. Results

| Measure | Result |
|---|---|
| Unit test cases | **164** in 14 files |
| Passed | **164** |
| Failed | **0** |
| Run time | 1.7 s |
| Statement coverage (unit only) | **89.0%** |
| Branch coverage (unit only) | **95.1%** |
| Function coverage (unit only) | **91.4%** |

The route files and `server.js` show 0% here because they only wire URLs to controllers; the black-box run covers them (see the [coverage report](COVERAGE_REPORT.md)).

### Coverage by module (unit tests only)

| Module | Requirement | Statements | Branches | Functions |
|---|---|---|---|---|
| slot | FR-1 · VPS-F-003 | 93.1% | 94.1% | 87.5% |
| vehicle | FR-1 · VPS-F-002 | 91.6% | 98.1% | 92.3% |
| reservation | FR-2 · VPS-F-004..006 | 93.3% | 94.6% | 88.9% |
| payment | FR-3 · VPS-F-007..008 | 95.5% | 96.3% | 93.8% |
| parking | FR-4 · VPS-F-009..010 | 93.3% | 98.1% | 90.0% |
| overstay | FR-5 · VPS-F-011..012 | 91.5% | 97.0% | 88.9% |
| analytics | FR-6 · VPS-F-013 | 94.5% | 87.2% | 83.3% |
| notification | FR-7 · VPS-F-014 | 94.4% | 92.7% | 94.1% |
| subscription | FR-8 | 95.9% | 98.6% | 93.8% |
| review | FR-9 | 86.9% | 88.9% | 92.3% |
| auth | Security · VPS-F-001, NF-004 | 94.0% | 97.4% | 95.2% |

## 3. Basis path analysis of key functions

Cyclomatic complexity V(G) = decisions + 1 gives the number of independent paths. Each path below has its own test.

**`payment.service.payForReservation`** (FR-3), V(G) = 7

| Path | Condition | Test |
|---|---|---|
| 1 | payment method not allowed | WB-PAY-01 |
| 2 | reservation not found or not the user's | WB-PAY-02 |
| 3 | already paid: return the earlier payment | WB-PAY-03 |
| 4 | reservation not CONFIRMED | WB-PAY-04 |
| 5 | gateway succeeds | WB-PAY-05 |
| 6 | gateway fails: FAILED payment recorded | WB-PAY-06 |
| 7 | duplicate-key race: return the winner, otherwise rethrow | WB-PAY-07 |

**`parking.service.checkIn`** (FR-4), V(G) = 7

| Path | Condition | Test |
|---|---|---|
| 1 | reservation not found | WB-PRK-01 |
| 2 | not CONFIRMED | WB-PRK-01 |
| 3 | booking already ended | WB-PRK-01 |
| 4 | already checked in | WB-PRK-02 |
| 5 | slot occupied | WB-PRK-02 |
| 6 | success: session ACTIVE | WB-PRK-03 |
| 7 | session save fails: slot released (rollback) | WB-PRK-04 |

**`reservation.service.withSlotLock`** (FR-2 · VPS-NF-005, added to fix DEF-02), V(G) = 4

| Path | Condition | Test |
|---|---|---|
| 1 | lock taken first time, booking saved, lock released | fr2-reservation tests |
| 2 | slot busy: retry, then lock taken | WB-RES-04 |
| 3 | work throws (overlap): lock still released (`finally`) | WB-RES-05 |
| 4 | slot stays busy: gives up with a clear message | WB-RES-06 |

**`overstay.service.checkout`** (FR-5), V(G) = 5

| Path | Condition | Test |
|---|---|---|
| 1 | reservation not found | WB-OVR-05 |
| 2 | reservation cancelled | WB-OVR-05 |
| 3 | late: fine created, slot freed | WB-OVR-06 |
| 4 | on time: no fine | WB-OVR-07 |
| 5 | already COMPLETED: existing fine returned, nothing saved | WB-OVR-07 |

## 4. Test cases

### `tests/auth-security.test.js` (8)

- ✅ NFR security: register stores a bcrypt hash, never the password
- ✅ NFR security: sign-up cannot create an admin account
- ✅ NFR security: short passwords and duplicate emails are refused
- ✅ NFR security: login checks the password against the hash
- ✅ NFR security: requests without a valid token get 401
- ✅ NFR security: the user id comes from the token, not the request
- ✅ NFR security: students only see their own records, the office sees anyone's
- ✅ NFR security: admin-only actions refuse students

### `tests/fr1-slot-recommendation.test.js` (9)

- ✅ vehicle registration rejects missing details
- ✅ vehicle registration rejects non-positive dimensions
- ✅ vehicle registration stores the number in upper case
- ✅ vehicle registration rejects duplicate vehicle numbers
- ✅ vehicleFitsSlot compares every dimension
- ✅ slot creation validates dimensions
- ✅ recommendation queries available slots large enough for the vehicle
- ✅ recommendation reports when no suitable slot is available
- ✅ recommend controller requires a vehicle number

### `tests/fr2-reservation.test.js` (9)

- ✅ reservation controller requires all fields
- ✅ reservation rejects invalid ids
- ✅ reservation rejects an end time before the start time
- ✅ reservation rejects a start time in the past
- ✅ reservation rejects a vehicle that does not fit the slot
- ✅ reservation rejects overlapping bookings for the same slot
- ✅ a confirmed reservation sends a confirmation notification
- ✅ cancellation is refused after the start time
- ✅ cancellation marks the reservation cancelled

### `tests/fr3-fr5-validation.test.js` (5)

- ✅ payment controller rejects missing payment fields
- ✅ payment controller rejects a missing payment method
- ✅ payment controller rejects an invalid payment method
- ✅ checkout controller rejects a missing userId
- ✅ payment gateway rejects missing configuration

### `tests/fr4-tracking.test.js` (7)

- ✅ tracking requires a vehicle number
- ✅ tracking reports an unknown vehicle
- ✅ tracking returns the current slot and past sessions
- ✅ check-in controller requires reservationId and userId
- ✅ check-in is refused when the slot is occupied
- ✅ check-in opens an active session and occupies the slot
- ✅ completing a session releases the slot

### `tests/fr6-analytics.test.js` (2)

- ✅ analytics aggregates occupancy, vehicle types and revenue
- ✅ analytics handles an empty facility

### `tests/fr7-notifications.test.js` (4)

- ✅ notification controller requires all fields
- ✅ reminders notify upcoming and expiring reservations once each
- ✅ a failed payment is recorded and notified
- ✅ a successful payment is notified as successful

### `tests/fr8-subscription.test.js` (11)

- ✅ monthly period handles January month-end correctly in a leap year
- ✅ monthly period handles December to January correctly
- ✅ monthly period rejects an invalid date
- ✅ monthly plan uses the configured subscription rate
- ✅ monthly plan rejects a non-positive configured rate
- ✅ expiry marks ended subscriptions expired and clears abandoned payments
- ✅ subscription creation controller rejects missing fields
- ✅ subscription creation service rejects invalid user IDs
- ✅ subscription listing rejects an invalid user ID
- ✅ subscription renewal controller rejects missing payment details
- ✅ subscription cancellation controller rejects a missing user ID

### `tests/fr9-reviews.test.js` (11)

- ✅ review is created after a completed parking session
- ✅ review rejects reservation not belonging to the user
- ✅ review is rejected when parking session is not completed
- ✅ reviews are retrieved using the correct slot ID
- ✅ reviews are retrieved using the correct user ID
- ✅ review is updated with the correct user ownership filter
- ✅ review deletion uses the correct user ownership filter
- ✅ slot rating calculates average and total review count
- ✅ slot rating returns zero when no reviews exist
- ✅ review controller rejects decimal ratings
- ✅ duplicate review error returns HTTP 409

### `tests/payment-calculations.test.js` (4)

- ✅ reservation charge bills each started hour at the configured rate
- ✅ overstay fine bills each started hour and reports overdue minutes
- ✅ no fine accrues at or before the reservation end time
- ✅ billing rejects invalid rates and time ranges

### `tests/wb-controllers.test.js` (37)

- ✅ WB-CTL analytics.getAnalytics: valid input -> 200, service error -> 500
- ✅ WB-CTL slot.createSlot: valid input -> 201, service error -> 400
- ✅ WB-CTL slot.getSlots: valid input -> 200, service error -> 500
- ✅ WB-CTL slot.recommendSlot: valid input -> 200, service error -> 500, 1 invalid input(s) -> 400
- ✅ WB-CTL reservation.createReservation: valid input -> 201, service error -> 400, 1 invalid input(s) -> 400
- ✅ WB-CTL reservation.getMyReservations: valid input -> 200, service error -> 500
- ✅ WB-CTL reservation.cancelReservation: valid input -> 200, service error -> 400
- ✅ WB-CTL payment.payForReservation: valid input -> 201, service error -> 400, 2 invalid input(s) -> 400
- ✅ WB-CTL payment.payFine: valid input -> 201, service error -> 400, 1 invalid input(s) -> 400
- ✅ WB-CTL payment.getTransactions: valid input -> 200, service error -> 500
- ✅ WB-CTL overstay.detectOverstays: valid input -> 200, service error -> 500
- ✅ WB-CTL overstay.getFines: valid input -> 200, service error -> 500
- ✅ WB-CTL overstay.checkout: valid input -> 200, service error -> 400, 1 invalid input(s) -> 400
- ✅ WB-CTL parking.checkIn: valid input -> 201, service error -> 400, 1 invalid input(s) -> 400
- ✅ WB-CTL parking.checkInSubscription: valid input -> 201, service error -> 400, 1 invalid input(s) -> 400
- ✅ WB-CTL parking.checkOutSubscription: valid input -> 200, service error -> 400, 1 invalid input(s) -> 400
- ✅ WB-CTL parking.getVehicleTracking: valid input -> 200, service error -> 404
- ✅ WB-CTL notification.createNotification: valid input -> 201, service error -> 400, 1 invalid input(s) -> 400
- ✅ WB-CTL notification.getNotifications: valid input -> 200, service error -> 500
- ✅ WB-CTL subscription.getMonthlyPlan: valid input -> 200, service error -> 400
- ✅ WB-CTL subscription.createSubscription: valid input -> 201, service error -> 400, 1 invalid input(s) -> 400
- ✅ WB-CTL subscription.getMySubscriptions: valid input -> 200, service error -> 400
- ✅ WB-CTL subscription.renewSubscription: valid input -> 201, service error -> 400, 1 invalid input(s) -> 400
- ✅ WB-CTL subscription.cancelSubscription: valid input -> 200, service error -> 400, 1 invalid input(s) -> 400
- ✅ WB-CTL review.getReviewsBySlot: valid input -> 200, service error -> 500, 1 invalid input(s) -> 400
- ✅ WB-CTL review.getReviewsByUser: valid input -> 200, service error -> 500, 1 invalid input(s) -> 400
- ✅ WB-CTL review.updateReview: valid input -> 200, service error -> 400, 5 invalid input(s) -> 400
- ✅ WB-CTL review.deleteReview: valid input -> 200, service error -> 500, 1 invalid input(s) -> 400
- ✅ WB-CTL vehicle.getVehicle: valid input -> 200, service error -> 404
- ✅ WB-CTL vehicle.getVehicleQr: valid input -> 200, service error -> 404
- ✅ WB-CTL vehicle.verifyVehicleQr: valid input -> 200, service error -> 400
- ✅ WB-CTL vehicle.getMyVehicles: valid input -> 200, service error -> 500
- ✅ WB-CTL vehicle.registerVehicle passes the signed-in owner and answers 201 / 400
- ✅ WB-CTL vehicle.ownVehicleOnly: owner passes, others get 403, errors 500
- ✅ WB-CTL review update / delete answer 404 when the review is not the user's
- ✅ WB-CTL notification.markNotificationAsRead: 200, 404 when missing, 500 on error
- ✅ WB-CTL auth controller: register 201, login 200, me 200, and errors keep their status

### `tests/wb-overstay-parking.test.js` (15)

- ✅ WB-OVR-01 detectOverstays fines an overdue booking and alerts the user once
- ✅ WB-OVR-02 an existing fine is updated without a second alert, and no session gives sessionId null
- ✅ WB-OVR-03 boundary: a booking that ends exactly now is not fined
- ✅ WB-OVR-04 getUserFines filters by user and sorts newest first
- ✅ WB-OVR-05 checkout refuses an unknown or cancelled reservation
- ✅ WB-OVR-06 checkout of a late booking completes it, fines it and frees the slot
- ✅ WB-OVR-07 checkout on time keeps no fine; an already completed booking is returned as is
- ✅ WB-PRK-01 checkIn rejects unknown, unconfirmed and finished bookings
- ✅ WB-PRK-02 checkIn rejects a second check-in and an occupied slot
- ✅ WB-PRK-03 checkIn occupies the slot and opens an ACTIVE session
- ✅ WB-PRK-04 checkIn frees the slot again when the session cannot be saved
- ✅ WB-PRK-05 completeSession frees the slot only when a session was active
- ✅ WB-PRK-06 subscription check-in covers no pass, already in, slot taken, success and rollback
- ✅ WB-PRK-07 subscription check-out needs an active session and frees the slot
- ✅ WB-PRK-08 vehicle tracking: missing number, unknown vehicle, parked and not parked

### `tests/wb-payment-subscription.test.js` (21)

- ✅ WB-PAY-01 an unknown payment method is refused before anything is read
- ✅ WB-PAY-02 paying for someone else's or an unknown booking fails
- ✅ WB-PAY-03 a booking that is already paid returns the earlier payment (no double charge)
- ✅ WB-PAY-04 only confirmed bookings can be paid
- ✅ WB-PAY-05 a successful payment charges each started hour and sends a payment alert
- ✅ WB-PAY-06 a gateway failure records a FAILED payment and tells the user
- ✅ WB-PAY-07 two payments racing for one booking: the duplicate-key loser returns the winner's payment
- ✅ WB-PAY-08 fines: unknown fine, already paid, and not checked out yet are refused
- ✅ WB-PAY-09 a fine whose payment already went through is marked PAID without charging again
- ✅ WB-PAY-10 paying a fine after checkout charges the fine amount and marks it PAID
- ✅ WB-PAY-11 fine payment races: duplicate key returns the saved payment, other errors propagate
- ✅ WB-PAY-12 subscription payment checks amount and period (boundary values 0, -1, NaN)
- ✅ WB-PAY-13 subscription payment: retry returns the saved payment, new period charges once
- ✅ WB-PAY-14 subscription payment error: recovers a saved payment, otherwise rethrows
- ✅ WB-PAY-15 transaction history is the user's payments, newest first
- ✅ WB-SUB-01 buying a pass: vehicle and slot must exist, be free, fit, and not be booked
- ✅ WB-SUB-02 buying a pass activates it once the payment succeeds
- ✅ WB-SUB-03 a failed pass payment marks it PAYMENT_FAILED and releases the slot lock
- ✅ WB-SUB-04 renewing: unknown or inactive passes are refused; an active one extends by a month
- ✅ WB-SUB-05 stopping renewal: not found, not active, already stopped, then success
- ✅ WB-SUB-06 listing my passes expires old ones first and sorts newest first

### `tests/wb-vehicle-slot-auth.test.js` (21)

- ✅ WB-VEH-01 registration rejects non-numeric sizes and stores the owner when signed in
- ✅ WB-VEH-02 getVehicle finds by upper-case number or reports not found
- ✅ WB-VEH-03 QR pass: unknown vehicle, old record gets a token, existing token is reused
- ✅ WB-VEH-04 QR scan: missing or wrong token is refused, a valid one returns the vehicle without the token
- ✅ WB-VEH-05 ownership: admin sees all; owner yes; other student no; unowned or unknown vehicles stay open
- ✅ WB-VEH-06 my vehicles are filtered by owner, newest first
- ✅ WB-SLT-01 createSlot: missing fields, non-numeric sizes, duplicate number, and success
- ✅ WB-SLT-02 getSlots filters by an upper-cased status only when one is given
- ✅ WB-SLT-03 recommendSlot reports an unknown vehicle with status 404
- ✅ WB-RES-01 createReservation input checks: bad ids, bad times, end before start, start in the past
- ✅ WB-RES-04 booking lock: waits while the slot is busy, then books and releases the lock
- ✅ WB-RES-05 booking lock is released even when the slot turns out to be taken
- ✅ WB-RES-06 booking lock gives up with a clear message when the slot stays busy
- ✅ WB-RES-02 cancel: not found, already cancelled, already started, and success
- ✅ WB-RES-03 my reservations are sorted by start time
- ✅ WB-NTF-01 alerts are listed newest first and only the owner can mark one read
- ✅ WB-AUT-01 register input checks: name, email format and password length boundaries (7, 8, 72, 73)
- ✅ WB-AUT-02 login: missing fields and an unknown email give the same generic answer
- ✅ WB-AUT-03 getUser returns the public profile or 404
- ✅ WB-AUT-04 ensureAdmin: no settings, creates once, leaves an existing admin, never promotes a student
- ✅ WB-AUT-05 a token signed with another secret, or expired, is rejected

## 5. Environment

| Item | Value |
|---|---|
| Date of run | 2026-11-18 |
| Code version | `cdcd871` on branch `docs/sprint3-final` |
| Runtime | Node.js v24.19.0 on Darwin 25.4.0 (arm64) |
| Database | MongoDB 9.0.2 (a fresh test database for each run) |
| Unit test runner | Node.js built-in test runner (`node:test`), database models stubbed |
| Coverage tool | c8 12.0.0 (V8 statement, branch and function coverage) |
| System test runner | `tests/blackbox/run-blackbox.mjs` over HTTP, plus `scripts/smoke-test.mjs` |
| Payment gateway | `PAYMENT_GATEWAY=demo` (deviation D-3) |

Raw results: [data/unit-tests.junit.xml](data/unit-tests.junit.xml) (JUnit XML).
