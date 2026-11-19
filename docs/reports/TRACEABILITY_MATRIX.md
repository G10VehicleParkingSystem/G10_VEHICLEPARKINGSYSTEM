# Requirements Traceability Matrix

G10 Vehicle Parking System · generated on 2026-11-18 from commit `cdcd871`.

This matrix links each requirement in the Software Test Plan (section 3, VPS-F/VPS-NF ids) and the features added later (FR-8, FR-9) to the tests that verify it. "Status" is the result of the black-box run in this report.

**21 of 21 requirements** are covered by at least one black-box test, and every functional requirement also has white-box unit tests.

| Requirement | Description | Black-box test cases | White-box unit tests (`tests/`) | Status |
|---|---|---|---|---|
| VPS-F-001 | User authentication and access control | TC-AUTH-01, TC-AUTH-02, TC-AUTH-03, TC-AUTH-04, TC-AUTH-05, TC-AUTH-06, TC-AUTH-07, TC-AUTH-08, TC-AUTH-09, TC-AUTH-10, TC-AUTH-11, TC-SEC-01, TC-SEC-02, TC-SEC-09, TC-SEC-10 | auth-security, wb-vehicle-slot-auth (WB-AUT) | ✅ Pass |
| VPS-F-002 | Vehicle registration and validation | TC-VEH-01, TC-VEH-02, TC-VEH-03, TC-VEH-04, TC-VEH-05, TC-VEH-06, TC-VEH-07, TC-VEH-08, TC-VEH-09 | fr1-slot-recommendation, wb-vehicle-slot-auth (WB-VEH) | ✅ Pass |
| VPS-F-003 | Vehicle-size-based slot recommendation | TC-SLOT-01, TC-SLOT-02, TC-SLOT-03, TC-SLOT-04, TC-SLOT-05, TC-SLOT-06, TC-SLOT-07 | fr1-slot-recommendation, wb-vehicle-slot-auth (WB-SLT) | ✅ Pass |
| VPS-F-004 | Parking slot reservation | TC-RES-01, TC-RES-06, TC-RES-07, TC-RES-08, TC-RES-09, TC-RES-15 | fr2-reservation, wb-vehicle-slot-auth (WB-RES) | ✅ Pass |
| VPS-F-005 | Reservation viewing and cancellation | TC-RES-02, TC-RES-10, TC-RES-11, TC-RES-12, TC-RES-13 | fr2-reservation, wb-vehicle-slot-auth (WB-RES-02, 03) | ✅ Pass |
| VPS-F-006 | Prevention of overlapping reservations | TC-RES-03, TC-RES-04, TC-RES-05 | fr2-reservation, wb-vehicle-slot-auth (WB-RES-04..06) | ✅ Pass |
| VPS-F-007 | Digital parking payment | TC-PAY-01, TC-PAY-02, TC-PAY-03, TC-PAY-04, TC-PAY-05 | payment-calculations, fr3-fr5-validation, wb-payment-subscription (WB-PAY) | ✅ Pass |
| VPS-F-008 | Payment transaction recording and history | TC-SEC-07, TC-PAY-06 | wb-payment-subscription (WB-PAY-15), wb-controllers | ✅ Pass |
| VPS-F-009 | Vehicle search and current-slot tracking | TC-TRK-01, TC-TRK-02, TC-TRK-03, TC-TRK-04, TC-TRK-05, TC-TRK-06 | fr4-tracking, wb-overstay-parking (WB-PRK-08) | ✅ Pass |
| VPS-F-010 | Parking history display | TC-SEC-08, TC-HIST-01 | fr4-tracking, wb-overstay-parking (WB-PRK-08) | ✅ Pass |
| VPS-F-011 | Overstay detection | TC-OVER-01, TC-OVER-02 | fr7-notifications, wb-overstay-parking (WB-OVR) | ✅ Pass |
| VPS-F-012 | Fine calculation and recording | TC-FINE-01, TC-FINE-02, TC-FINE-03, TC-FINE-04 | payment-calculations, wb-payment-subscription (WB-PAY-08..11) | ✅ Pass |
| VPS-F-013 | Administrator analytics and reports | TC-SEC-03, TC-SEC-04, TC-SEC-05, TC-SEC-06, TC-ANA-01 | fr6-analytics, auth-security (admin role) | ✅ Pass |
| VPS-F-014 | Notifications and alerts | TC-NTF-01, TC-NTF-02, TC-NTF-03, TC-NTF-04 | fr7-notifications, wb-vehicle-slot-auth (WB-NTF) | ✅ Pass |
| VPS-NF-001 | Recommendation and reservation within 2-3 s | TC-PERF-01, TC-PERF-02 | – | ✅ Pass |
| VPS-NF-002 | Vehicle search within 2 s | TC-PERF-03 | – | ✅ Pass |
| VPS-NF-003 | Analytics within 3-5 s | TC-PERF-04 | – | ✅ Pass |
| VPS-NF-004 | Secure password and payment-data handling | TC-SEC-11, TC-SEC-12 | auth-security, wb-vehicle-slot-auth (WB-AUT) | ✅ Pass |
| VPS-NF-005 | No double bookings, consistent data | TC-RES-14, TC-PAY-02 | fr2-reservation, wb-vehicle-slot-auth (WB-RES-04..06), wb-payment-subscription (WB-PAY-03, 07) | ✅ Pass |
| FR-8 | Monthly subscription (added after the Test Plan) | TC-SUB-01, TC-SUB-02 | fr8-subscription, wb-payment-subscription (WB-SUB) | ✅ Pass |
| FR-9 | Slot reviews and ratings (added after the Test Plan) | TC-REV-01, TC-REV-02, TC-REV-03 | fr9-reviews, wb-controllers | ✅ Pass |

Test Plan section 5.1 (security validation) maps to TC-SEC-01..12, TC-RES-13, TC-RES-15, TC-TRK-05, TC-FINE-04 and TC-NTF-04.

The example ids in the Test Plan (section 13) are kept: TC-AUTH-01/02, TC-SLOT-01/02, TC-RES-03/04, TC-PAY-01/02, TC-OVER-01/02 and TC-PERF-01 are the cases with those ids in the [black-box report](BLACK_BOX_TEST_REPORT.md).
