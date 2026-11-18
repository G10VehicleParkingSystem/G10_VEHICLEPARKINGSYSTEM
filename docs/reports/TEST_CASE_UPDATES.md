# Test Case Updates for Sprint Changes

G10 Vehicle Parking System · updated 2026-11-18.

The Software Test Plan v1.0 (16-Sep-2026) was written before development. This page lists how the test cases were updated as the sprints changed the product, so every change in [DEVIATIONS.md](../DEVIATIONS.md) has matching tests.

## Cases kept from the Test Plan

| Test Plan id (section 13) | Requirement | Current case | Change |
|---|---|---|---|
| TC-AUTH-01, TC-AUTH-02 | VPS-F-001 | TC-AUTH-01, TC-AUTH-02 | Kept. Login was built later (D-1), so these ran from Sprint 2 onwards |
| TC-SLOT-01, TC-SLOT-02 | VPS-F-003 | TC-SLOT-01, TC-SLOT-02 | Kept; SLOT-02 now checks that two-wheelers get the bike bay |
| TC-RES-03, TC-RES-04 | VPS-F-006 | TC-RES-03, TC-RES-04 | Kept; RES-04 became a boundary test (one minute of overlap) |
| TC-PAY-01, TC-PAY-02 | VPS-F-007 | TC-PAY-01, TC-PAY-02 | Kept; PAY-02 now checks that paying twice does not charge twice |
| TC-OVER-01, TC-OVER-02 | VPS-F-011 | TC-OVER-01, TC-OVER-02 | Kept |
| TC-PERF-01 | VPS-NF-001 | TC-PERF-01 | Kept; measured as average, 95th percentile and slowest of 20 calls |

## Cases changed because of sprint changes

| Change in the product | Deviation / PR | What changed in the tests |
|---|---|---|
| Sprint 1 endpoints took a `userId` parameter; login came later | D-1, PR #50 | Every case now signs in and sends a token. New cases check that the `userId` sent by a student is ignored (TC-RES-15) and that other people's records answer 403 (TC-SEC-07, 08, TC-TRK-05) |
| Admin functions were open in Sprint 1 | D-1 | Decision-table cases TC-SEC-03..06: a student gets 403 on analytics, adding slots, overstay detection and creating notifications |
| Payment sandbox replaced by a demo gateway | D-3 | Payment cases expect provider `DEMO_GATEWAY`; the failure path is tested in white-box WB-PAY-06 by switching the gateway off |
| No parking hardware: check-in and check-out are API calls | D-4 | Tracking cases use `/parking/check-in` and `/overstays/:id/checkout` in place of gate events |
| Overstay is detected on a schedule | D-5 | TC-OVER-01 triggers detection through the office endpoint instead of waiting a minute |
| Cancelling frees the time window, not the slot status | D-9 | TC-RES-12 checks that a cancelled time can be booked again |
| Monthly subscription added (FR-8) | PR #40 | New TC-SUB-01, 02 and white-box WB-SUB-01..06 |
| Slot reviews added (FR-9) | PR #42, #44, #45 | New TC-REV-01..03 |
| QR gate pass added | PR #46 | TC-VEH-01 checks a QR image is returned; TC-VEH-09 checks a bad QR is refused; white-box WB-VEH-03, 04 |
| Vehicles belong to an account | PR #50 | TC-VEH-08 (my vehicles), TC-TRK-05 / 06 (only the owner or the office can track) |
| DEF-02 double booking fixed | this PR | TC-RES-14 added as a permanent regression test (20 parallel bookings, 3 rounds) |

## New kinds of testing added in Sprint 2

- **Boundary value cases** for password length (TC-AUTH-03..05), vehicle size (TC-VEH-03, 06), booking edges (TC-RES-04..06), billing hours (TC-PAY-03) and ratings (TC-REV-02).
- **Security input cases** for Test Plan 5.1: forged tokens (TC-SEC-02), NoSQL injection in the login (TC-SEC-09), malformed JSON (TC-SEC-10), and how passwords and payments are stored (TC-SEC-11, 12).
- **White-box unit tests** written for branch coverage (`tests/wb-*.test.js`), see the [white-box report](WHITE_BOX_TEST_REPORT.md).
