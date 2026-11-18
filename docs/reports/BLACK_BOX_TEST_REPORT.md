# Black-Box Test Report

G10 Vehicle Parking System · generated on 2026-11-18 from commit `cdcd871`.

## 1. Purpose and approach

Black-box (functional) testing checks the system only through its public REST API, the same interface the CampusPark web app uses. Each case is designed from the SRS and the Software Test Plan, with no reference to the code. The suite (`tests/blackbox/run-blackbox.mjs`) starts from an empty MongoDB database, creates its own accounts, slots and vehicles, and runs every case in order against the real server.

Each case carries the Test Plan feature id it verifies (VPS-F-xxx / VPS-NF-xxx) and the technique used to choose its input:

| Technique | Meaning | Cases |
|---|---|---|
| EP | Equivalence partitioning: one representative input from each valid and invalid class | 41 |
| BVA | Boundary value analysis: inputs on a limit and just either side of it | 14 |
| DT | Decision table: combinations of who is asking (student, other student, office) and what they ask for | 12 |
| ST | State transition: moving a booking through CONFIRMED, checked in, COMPLETED or CANCELLED, including invalid moves | 12 |
| UC | Use case / scenario: a full user journey across several features | 4 |
| PERF | Performance: repeated requests, timed against the response-time NFR | 4 |

Test data: the API correctly refuses to create a booking in the past, so the overstay cases (TC-OVER-01, TC-FINE-01..04) insert one booking that ended 90 minutes ago straight into the database as test data. TC-SEC-11 and TC-SEC-12 read the database to check how passwords and payments are stored. Everything else goes through the API only.

## 2. Summary

| Measure | Result |
|---|---|
| Black-box cases | **87** |
| Passed | **87** |
| Failed | **0** |
| Not run | 0 |
| Pass rate | **100.0%** |
| Smoke test (`scripts/smoke-test.mjs`, used by CI/CD) | ✅ all checks passed |

## 3. Response times (VPS-NF-001 to NF-003)

Each operation was called 20 times in a row against the local server.

| ID | Requirement | Operation | Average | 95th percentile | Slowest | Target | Result |
|---|---|---|---|---|---|---|---|
| TC-PERF-01 | VPS-NF-001 | Slot recommendation | 3.5 ms | 4.8 ms | 5.4 ms | under 3 s | ✅ Pass |
| TC-PERF-02 | VPS-NF-001 | Reservation | 5.3 ms | 6.3 ms | 7.4 ms | under 3 s | ✅ Pass |
| TC-PERF-03 | VPS-NF-002 | Vehicle search | 4.3 ms | 5 ms | 5.7 ms | under 2 s | ✅ Pass |
| TC-PERF-04 | VPS-NF-003 | Analytics report | 3.1 ms | 3.8 ms | 4.1 ms | under 5 s | ✅ Pass |

These were measured on a single developer laptop with a small dataset, so they show the API is well inside its targets. They are not a load test.

## 4. Test cases and results

### Accounts and login (VPS-F-001)

| ID | Requirement | Technique | Test | Input | Expected | Actual | Result |
|---|---|---|---|---|---|---|---|
| TC-AUTH-01 | VPS-F-001 | EP | Register a student with valid details | name, ananya-mwmh8r5n@college.test, 9-char password | 201, account returned without any password field | 201 Account created | ✅ Pass |
| TC-AUTH-02 | VPS-F-001 | EP | Register with an email that is already used | ananya-mwmh8r5n@college.test | 409 already exists | 409 An account with this email already exists | ✅ Pass |
| TC-AUTH-03 | VPS-F-001 | BVA | Password one below the minimum (7 characters) | password '1234567' | 400 | 400 Password must be at least 8 characters | ✅ Pass |
| TC-AUTH-04 | VPS-F-001 | BVA | Password exactly at the minimum (8 characters) | password '12345678' | 201 | 201 Account created | ✅ Pass |
| TC-AUTH-05 | VPS-F-001 | BVA | Password above the maximum (73 characters) | 73 x 'a' | 400 | 400 Password must be at most 72 characters | ✅ Pass |
| TC-AUTH-06 | VPS-F-001 | EP | Register with an invalid email | 'not-an-email' | 400 | 400 A valid email is required | ✅ Pass |
| TC-AUTH-07 | VPS-F-001 | EP | Sign-up cannot create an administrator | role 'admin' | 400 | 400 Role must be student or faculty | ✅ Pass |
| TC-AUTH-08 | VPS-F-001 | EP | Sign in with the correct password | ananya-mwmh8r5n@college.test | 200 with a token | 200 Signed in | ✅ Pass |
| TC-AUTH-09 | VPS-F-001 | EP | Sign in with a wrong password | wrong password | 401 'Email or password is incorrect' | 401 Email or password is incorrect | ✅ Pass |
| TC-AUTH-10 | VPS-F-001 | EP | Unknown email gets the same message (no account enumeration) | nobody@college.test | 401 with the same message as a wrong password | 401 Email or password is incorrect | ✅ Pass |
| TC-AUTH-11 | VPS-F-001 | EP | Register a faculty member | role 'faculty' | 201, role faculty | 201 Account created | ✅ Pass |

### Security validation (Test Plan 5.1, VPS-NF-004)

| ID | Requirement | Technique | Test | Input | Expected | Actual | Result |
|---|---|---|---|---|---|---|---|
| TC-SEC-01 | VPS-F-001 / 5.1 | EP | Protected function without signing in | GET /reservations/my/<id>, no token | 401 | 401 Please sign in first | ✅ Pass |
| TC-SEC-02 | VPS-F-001 / 5.1 | EP | Forged token | Authorization: Bearer forged.token.value | 401 | 401 Your sign-in has expired, please sign in again | ✅ Pass |
| TC-SEC-03 | VPS-F-013 / 5.1 | DT | Student calls admin-only GET /analytics | student token | 403 | 403 Only the parking office can do this | ✅ Pass |
| TC-SEC-04 | VPS-F-013 / 5.1 | DT | Student calls admin-only POST /slots | student token | 403 | 403 Only the parking office can do this | ✅ Pass |
| TC-SEC-05 | VPS-F-013 / 5.1 | DT | Student calls admin-only POST /overstays/detect | student token | 403 | 403 Only the parking office can do this | ✅ Pass |
| TC-SEC-06 | VPS-F-013 / 5.1 | DT | Student calls admin-only POST /notifications | student token | 403 | 403 Only the parking office can do this | ✅ Pass |
| TC-SEC-07 | VPS-F-008 / 5.1 | DT | Student reads another student's payment history | A's token, B's id | 403 | 403 You can only see your own records | ✅ Pass |
| TC-SEC-08 | VPS-F-010 / 5.1 | DT | Student reads another student's reservations | A's token, B's id | 403 | 403 You can only see your own records | ✅ Pass |
| TC-SEC-09 | VPS-F-001 / 5.1 | EP | NoSQL injection in the login email | {"email": {"$gt": ""}, "password": {"$gt": ""}} | 400, not signed in | 400 Email and password are required | ✅ Pass |
| TC-SEC-10 | VPS-F-001 / 5.1 | EP | Malformed JSON body | '{bad json' | 4xx, server keeps running | 400, server alive: true | ✅ Pass |
| TC-SEC-11 | VPS-NF-004 | EP | Passwords are stored only as bcrypt hashes | users collection, A's record | passwordHash starts with $2, no plain password anywhere | hash prefix $2a$, plain text found: false | ✅ Pass |
| TC-SEC-12 | VPS-NF-004 | EP | No card details are stored with payments | payments collection, A's payments | no card number, CVV or expiry fields | fields: __v, _id, amount, createdAt, currency, paymentMethod, provider, providerReference, reservationId, status, subscriptionId, subscriptionPeriodStart, transactionId, updatedAt, userId | ✅ Pass |

### Vehicles (VPS-F-002)

| ID | Requirement | Technique | Test | Input | Expected | Actual | Result |
|---|---|---|---|---|---|---|---|
| TC-VEH-01 | VPS-F-002 | EP | Register a car with valid details | KA01MWMH8R5N, CAR 4.5 x 1.8 x 1.5 | 201 with a QR gate pass image | 201 Vehicle registered successfully | ✅ Pass |
| TC-VEH-02 | VPS-F-002 | EP | Register the same number again | KA01MWMH8R5N | 400 already registered | 400 Vehicle is already registered | ✅ Pass |
| TC-VEH-03 | VPS-F-002 | BVA | Vehicle with length 0 (on the boundary) | length 0 | 400 | 400 Vehicle dimensions must be greater than zero | ✅ Pass |
| TC-VEH-04 | VPS-F-002 | BVA | Vehicle with length -1 (below) | length -1 | 400 | 400 Vehicle dimensions must be greater than zero | ✅ Pass |
| TC-VEH-05 | VPS-F-002 | EP | Vehicle with length as text | length "4.5" | 400 | 400 Vehicle dimensions must be numbers | ✅ Pass |
| TC-VEH-06 | VPS-F-002 | BVA | Vehicle with the smallest positive size (0.1 m) | 0.1 x 0.1 x 0.1 | 201 | 201 Vehicle registered successfully | ✅ Pass |
| TC-VEH-07 | VPS-F-002 | EP | Vehicle type outside the allowed list | type 'PLANE' | 400 | 400 Vehicle validation failed: type: `PLANE` is not a valid enum value for path `type`. | ✅ Pass |
| TC-VEH-08 | VPS-F-002 | EP | My vehicles lists only my own | GET /vehicles/mine as A | contains KA01MWMH8R5N, not B's vehicle | 200 | ✅ Pass |
| TC-VEH-09 | VPS-F-002 | EP | Scan an invalid QR gate pass | token 'not-a-real-token' | 400 | 400 Invalid QR code or vehicle not found | ✅ Pass |

### Slot recommendation (VPS-F-003)

| ID | Requirement | Technique | Test | Input | Expected | Actual | Result |
|---|---|---|---|---|---|---|---|
| TC-SLOT-01 | VPS-F-003 | EP | Car gets the smallest slot it fits, not the large one | KA01MWMH8R5N with free slots S (5 m) and L (20 m) | SMWMH8R5N | 200 SMWMH8R5N | ✅ Pass |
| TC-SLOT-02 | VPS-F-003 | EP | Two-wheeler gets a two-wheeler bay | KA02BMWMH8R5N BIKE 2 x 0.8 x 1.2 | a slot no bigger than the bike bay | 200 TWMWMH8R5N | ✅ Pass |
| TC-SLOT-03 | VPS-F-003 | BVA | Vehicle exactly the size of a slot fits it | 5 x 2.5 x 2.2 vehicle, 5 x 2.5 x 2.2 slot | 200, a slot at least that size | 200 SMWMH8R5N | ✅ Pass |
| TC-SLOT-04 | VPS-F-003 | EP | Vehicle too big for every slot | TRUCK 500 m long | 404 no suitable slot | 404 No suitable parking slot is currently available | ✅ Pass |
| TC-SLOT-05 | VPS-F-003 | EP | Recommendation without a vehicle number | {} | 400 | 400 vehicleNumber is required | ✅ Pass |
| TC-SLOT-06 | VPS-F-003 | EP | Recommendation for an unknown vehicle | ZZ99UNKNOWN | 404 | 404 Vehicle not found | ✅ Pass |
| TC-SLOT-07 | VPS-F-003 | BVA | Office adds a slot with a zero dimension | width 0 | 400 | 400 Slot dimensions must be greater than zero | ✅ Pass |

### Reservations (VPS-F-004..006, VPS-NF-005)

| ID | Requirement | Technique | Test | Input | Expected | Actual | Result |
|---|---|---|---|---|---|---|---|
| TC-RES-01 | VPS-F-004 | EP | Book a free slot for one hour | KA01MWMH8R5N in SMWMH8R5N, +10 to +70 min | 201 CONFIRMED | 201 Parking slot reserved successfully | ✅ Pass |
| TC-RES-02 | VPS-F-005 | EP | View my reservations | GET /reservations/my/<A> | 200 and contains the new booking | 200 | ✅ Pass |
| TC-RES-03 | VPS-F-006 | EP | Overlapping booking of the same slot | +20 to +40 min (inside the first booking) | 400 already reserved | 400 This parking slot is already reserved for the selected time | ✅ Pass |
| TC-RES-04 | VPS-F-006 | BVA | Booking that overlaps by one minute at the end | +69 to +100 min | 400 | 400 This parking slot is already reserved for the selected time | ✅ Pass |
| TC-RES-05 | VPS-F-006 | BVA | Booking that starts exactly when the other ends | start = previous end | 201 (touching is not overlapping) | 201 Parking slot reserved successfully | ✅ Pass |
| TC-RES-06 | VPS-F-004 | BVA | End time equal to start time | start = end = +200 min | 400 | 400 End time must be after start time | ✅ Pass |
| TC-RES-07 | VPS-F-004 | EP | Booking that starts in the past | -30 to +30 min | 400 | 400 Reservation cannot start in the past | ✅ Pass |
| TC-RES-08 | VPS-F-004 | EP | Vehicle that does not fit the chosen slot | car in the two-wheeler bay | 400 | 400 Vehicle does not fit the selected parking slot | ✅ Pass |
| TC-RES-09 | VPS-F-004 | EP | Invalid ids in the booking | slotId 'abc' | 400 | 400 slotId is not a valid id | ✅ Pass |
| TC-RES-10 | VPS-F-005 | ST | Cancel a future booking (CONFIRMED -> CANCELLED) | large slot +400 to +460 min, then DELETE | 200 CANCELLED | 200 Reservation cancelled successfully | ✅ Pass |
| TC-RES-11 | VPS-F-005 | ST | Cancel the same booking again | DELETE again | 400 already cancelled | 400 Reservation is already cancelled | ✅ Pass |
| TC-RES-12 | VPS-F-005 | ST | A cancelled time can be booked again | same slot and time | 201 | 201 Parking slot reserved successfully | ✅ Pass |
| TC-RES-13 | VPS-F-005 | DT | Another student cancels my booking | B deletes A's booking | 400 not found (not cancelled) | 400 Reservation not found | ✅ Pass |
| TC-RES-14 | VPS-NF-005 | EP | Twenty requests book the same free slot at the same moment (3 rounds) | 3 x 20 parallel POST /reservations, identical slot and time | exactly one 201 per round | bookings confirmed per round: 1, 1, 1 | ✅ Pass |
| TC-RES-15 | VPS-F-004 / 5.1 | DT | A userId in the body cannot book for someone else | A's token with userId of B | booking stored under A | 201, owner A | ✅ Pass |

### Tracking and history (VPS-F-009, F-010)

| ID | Requirement | Technique | Test | Input | Expected | Actual | Result |
|---|---|---|---|---|---|---|---|
| TC-TRK-01 | VPS-F-009 | ST | Check in to a confirmed booking | POST /parking/check-in | 201 ACTIVE | 201 Vehicle checked in successfully | ✅ Pass |
| TC-TRK-02 | VPS-F-009 | EP | Find my vehicle while it is parked | KA01MWMH8R5N | current slot SMWMH8R5N | 200 SMWMH8R5N | ✅ Pass |
| TC-TRK-03 | VPS-F-009 | ST | Check in twice | same booking | 400 already checked in | 400 Reservation is already checked in | ✅ Pass |
| TC-TRK-04 | VPS-F-009 | EP | Track an unregistered vehicle | ZZ00MWMH8R5N | 404 | 404 Vehicle not found | ✅ Pass |
| TC-TRK-05 | VPS-F-009 / 5.1 | DT | Track another student's vehicle | B tracks A's car | 403 | 403 This vehicle is registered to another account | ✅ Pass |
| TC-TRK-06 | VPS-F-009 | DT | Parking office tracks any vehicle | office tracks A's car | 200 | 200 Vehicle tracking details retrieved successfully | ✅ Pass |
| TC-HIST-01 | VPS-F-010 | ST | After checkout the visit appears in parking history | KA01MWMH8R5N | no current slot, 1 visit in history | current none, history 1 | ✅ Pass |

### Payments (VPS-F-007, F-008)

| ID | Requirement | Technique | Test | Input | Expected | Actual | Result |
|---|---|---|---|---|---|---|---|
| TC-PAY-01 | VPS-F-007 | EP | Pay for a one-hour booking by UPI | UPI, 60-minute booking | 201 SUCCESS, Rs 50 | 201 SUCCESS Rs 50 | ✅ Pass |
| TC-PAY-02 | VPS-F-007 / NF-005 | EP | Pay the same booking again | second UPI payment | same transaction returned, not charged twice | 201 same transaction | ✅ Pass |
| TC-PAY-03 | VPS-F-007 | BVA | Booking of 61 minutes is billed as two hours | 61-minute booking | Rs 100 | 201 Rs 100 | ✅ Pass |
| TC-PAY-04 | VPS-F-007 | EP | Unsupported payment method | paymentMethod 'CASH' | 400 | 400 paymentMethod must be one of: UPI, CARD, NET_BANKING, WALLET | ✅ Pass |
| TC-PAY-05 | VPS-F-007 | ST | Pay for a cancelled booking | cancelled booking | 400 | 400 Only confirmed reservations can be paid | ✅ Pass |
| TC-PAY-06 | VPS-F-008 | EP | Payment history shows my transactions | GET /payments/my/<A> | 200 with both payments | 200 | ✅ Pass |

### Overstay and fines (VPS-F-011, F-012)

| ID | Requirement | Technique | Test | Input | Expected | Actual | Result |
|---|---|---|---|---|---|---|---|
| TC-OVER-01 | VPS-F-011 | UC | Overstay is detected for a booking that ended 90 minutes ago | B's booking ended 90 min ago; office runs detection | detected >= 1 | 200 detected 1 | ✅ Pass |
| TC-OVER-02 | VPS-F-011 | ST | Check out before the booking ends: no fine | A checks out the 1-hour booking early | 200 COMPLETED, no fine | 200 COMPLETED, fine none | ✅ Pass |
| TC-FINE-01 | VPS-F-012 | BVA | Fine for 90 minutes over is two started hours | 90 min overdue at Rs 100/hour | overdueMinutes >= 90, fine Rs 200, UNPAID | 91 min, Rs 200, UNPAID | ✅ Pass |
| TC-FINE-02 | VPS-F-012 | ST | Fine cannot be paid before checking out | pay the fine while the booking is open | 400 | 400 Overstay fine can be paid after checkout | ✅ Pass |
| TC-FINE-03 | VPS-F-012 | ST | Check out late, then pay the fine | checkout, then pay by card | 200 checkout with fine Rs 200, then 201 SUCCESS Rs 200 | checkout 200 fine Rs 200; pay 201 Rs 200 | ✅ Pass |
| TC-FINE-04 | VPS-F-012 | DT | Another student pays my fine | A pays B's fine | 400 fine not found | 400 Fine not found | ✅ Pass |

### Analytics (VPS-F-013)

| ID | Requirement | Technique | Test | Input | Expected | Actual | Result |
|---|---|---|---|---|---|---|---|
| TC-ANA-01 | VPS-F-013 | EP | Parking office opens the analytics report | GET /analytics as office | 200 with occupancy, peak hours, vehicle types, revenue | 200 | ✅ Pass |

### Notifications (VPS-F-014)

| ID | Requirement | Technique | Test | Input | Expected | Actual | Result |
|---|---|---|---|---|---|---|---|
| TC-NTF-01 | VPS-F-014 | UC | Booking and payment alerts are delivered | A's alerts | RESERVATION_CONFIRMED and PAYMENT_SUCCESS present | PAYMENT_SUCCESS, RESERVATION_CONFIRMED | ✅ Pass |
| TC-NTF-02 | VPS-F-014 | UC | Overstay alert is delivered | B's alerts | OVERSTAY present | PAYMENT_SUCCESS, OVERSTAY, RESERVATION_CONFIRMED | ✅ Pass |
| TC-NTF-03 | VPS-F-014 | ST | Mark an alert as read | PATCH /notifications/<id>/read | 200 isRead true | 200 | ✅ Pass |
| TC-NTF-04 | VPS-F-014 / 5.1 | DT | Mark someone else's alert as read | B marks A's alert | 404 | 404 Notification not found | ✅ Pass |

### Monthly pass (FR-8)

| ID | Requirement | Technique | Test | Input | Expected | Actual | Result |
|---|---|---|---|---|---|---|---|
| TC-SUB-01 | FR-8 | UC | Buy a monthly pass for a free slot | UPI, Rs 3000 plan | 201 ACTIVE for one month | 201 Monthly parking subscription activated successfully | ✅ Pass |
| TC-SUB-02 | FR-8 | ST | Stop renewal of the pass | PATCH /subscriptions/<id>/cancel | 200 cancelAtPeriodEnd true | 200 Subscription scheduled for cancellation at period end | ✅ Pass |

### Ratings (FR-9)

| ID | Requirement | Technique | Test | Input | Expected | Actual | Result |
|---|---|---|---|---|---|---|---|
| TC-REV-01 | FR-9 | EP | Rate a completed visit 4 stars | rating 4 | 201 | 201 Review submitted successfully | ✅ Pass |
| TC-REV-02 | FR-9 | BVA | Rating above the maximum | rating 6 | 400 | 400 Rating must be an integer between 1 and 5 | ✅ Pass |
| TC-REV-03 | FR-9 | EP | Rate the same visit twice | second rating | 409 | 409 A review already exists for this reservation | ✅ Pass |

### Response times (VPS-NF-001..003)

| ID | Requirement | Technique | Test | Input | Expected | Actual | Result |
|---|---|---|---|---|---|---|---|
| TC-PERF-01 | VPS-NF-001 | PERF | Slot recommendation response time | 20 requests | every response under 3 s | avg 3.5 ms, p95 4.8 ms, max 5.4 ms | ✅ Pass |
| TC-PERF-02 | VPS-NF-001 | PERF | Reservation response time | 20 requests | every response under 3 s | avg 5.3 ms, p95 6.3 ms, max 7.4 ms | ✅ Pass |
| TC-PERF-03 | VPS-NF-002 | PERF | Vehicle search response time | 20 requests | every response under 2 s | avg 4.3 ms, p95 5.0 ms, max 5.7 ms | ✅ Pass |
| TC-PERF-04 | VPS-NF-003 | PERF | Analytics report response time | 20 requests | every response under 5 s | avg 3.1 ms, p95 3.8 ms, max 4.1 ms | ✅ Pass |


## 5. Defects found by black-box testing

**DEF-02 (Critical): simultaneous requests could double-book a slot.** TC-RES-14 sends 20 identical booking requests for one free slot at the same moment. Before the fix, between 2 and 19 of them were confirmed in each round; with the per-slot booking lock exactly one is. See the [test summary report](TEST_SUMMARY_REPORT.md#5-defects) for details.

## 6. Environment

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

Raw results: [data/black-box-results.json](data/black-box-results.json).
