# Sprint 1 Report

**Project:** G10 Vehicle Parking System
**Sprint 1:** 19-Oct-2026 to 23-Oct-2026 (backlog dry run 12-16 Oct)
**Tracking:** [GitHub Project - Sprint Planning](https://github.com/orgs/G10VehicleParkingSystem/projects/2)
**Demo video:** [`SE_sprint1.mp4`](../SE_sprint1.mp4)

## Sprint goal

Deliver working back-end modules for all seven functional requirements on
`main`, with CI on every pull request, so Sprint 2 can add authentication and
the React front end on top of stable APIs.

## Completed work

| FR | Owner | Delivered | SRS requirements |
|---|---|---|---|
| FR-1 Smart slot allocation | Shiva Sandesh | Vehicle registration, slot creation/listing, size-based slot recommendation | REQ-1, REQ-2, REQ-3 |
| FR-2 Reservation & cancellation | Shiva Nandan R | Create/view/cancel reservations, overlap prevention, vehicle-fits-slot check | REQ-4 to REQ-7 |
| FR-3 Digital payment & history | Shantanu Milind Tandel | Server-calculated charges, idempotent payments, fine payments, success and failure recorded in history | REQ-8 to REQ-11 |
| FR-4 Vehicle tracking & history | Shiva Sandesh | Check-in creates a parking session; search by vehicle number returns current slot and past sessions | REQ-12 to REQ-14 |
| FR-5 Overstay detection & fines | Shantanu Milind Tandel | Scheduled detection, per-hour fine, fine linked to the parking session, checkout frees the slot | REQ-15 to REQ-17 |
| FR-6 Admin analytics & reports | Sanchita V G | Reservation summary, live occupancy, frequently used slots, peak hours, vehicle-type breakdown, revenue (parking/fines/daily) | REQ-18 to REQ-20 |
| FR-7 Notifications & alerts | Shiva Nandan R | Reservation confirmed, upcoming reservation, parking expiring, payment success/failure, overstay | REQ-21 to REQ-23 |

Process items:

- GitHub Actions (`.github/workflows/backend-ci.yml`) checks the syntax of every
  JavaScript file and runs the unit tests on each push and pull request.
- Each feature was raised as a pull request by its owner and merged into `main`.
- Sprint 1 demo video recorded and uploaded to the repository.

## Test evidence

`npm test` runs 40 unit tests (Node test runner). Models are stubbed, so the
suite needs no database.

| File | Covers |
|---|---|
| `tests/fr1-slot-recommendation.test.js` | Vehicle validation, duplicate numbers, dimension matching, no-slot message |
| `tests/fr2-reservation.test.js` | Required fields, invalid ids, time validation, fit check, overlap query, confirmation notification, cancellation rules |
| `tests/fr3-fr5-validation.test.js` | Payment/checkout input validation, gateway configuration |
| `tests/payment-calculations.test.js` | Parking charge and overstay fine calculation |
| `tests/fr4-tracking.test.js` | Tracking lookup, check-in rules, slot occupancy and release |
| `tests/fr6-analytics.test.js` | Occupancy, peak hours, vehicle types, revenue split and daily totals |
| `tests/fr7-notifications.test.js` | Reminder windows and de-duplication, payment success/failure notifications |

Manual end-to-end run against local MongoDB (27-Oct-2026): register vehicles
and slots, get a recommendation, reject an oversized vehicle and an overlapping
booking, reserve, check in, track, pay, receive upcoming/expiring reminders,
detect an overstay, check out, pay the fine, record a failed payment, and read
analytics. Every step returned the expected result.

Response-time spot check on that small dataset: recommendation 22 ms, tracking
7 ms, analytics 2 ms (targets: 2-3 s, 2 s, 3-5 s).

## Carried over to Sprint 2 (26-30 Oct)

- Authentication, hashed passwords and admin role checks (NFR security).
- React front end for all screens in SRS 3.1, including the admin dashboard.
- API integration tests against a test database; performance tests with
  realistic data; usability and UAT runs from the Test Plan.
- Final documentation and freeze of the development cycle.

Deviations from the submitted SRS, SAD and Test Plan are listed in
[`DEVIATIONS.md`](DEVIATIONS.md).
