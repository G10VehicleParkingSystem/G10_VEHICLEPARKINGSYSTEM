# Sprint 2 and Sprint 3 Report

**Project:** G10 Vehicle Parking System
**Sprint 2:** 26-Oct-2026 to 30-Oct-2026, with carried-over work finished by 18-Nov-2026
**Sprint 3 (Testing):** 16-Nov-2026 to 20-Nov-2026
**Release:** `v1.0`, tagged 19-Nov-2026, live at https://g10-parking.onrender.com
**Tracking:** [GitHub Project](https://github.com/orgs/G10VehicleParkingSystem/projects/3)
**Demo video:** [`SE_sprint2.mp4`](../SE_sprint2.mp4) (recorded 31 Oct)

## Sprint 2 goal

Turn the Sprint 1 back end into a product students and the parking office can
use: authentication and roles, a web front end, the features added during the
sprint, and a pipeline that tests and deploys every change.

## Sprint 2 completed work

| Item | Owner | Pull requests | Merged |
|---|---|---|---|
| FR-8 Monthly reserved parking subscription | Shantanu Milind Tandel | #40 | 4 Nov |
| FR-9 Slot reviews and ratings, with tests | Shiva Nandan R | #42, #44, #45 | 31 Oct to 10 Nov |
| QR code gate pass for vehicle identification | Shiva Sandesh | #46 | 10 Nov |
| CI improvements: validation, then coverage and smoke test | Shiva Nandan R | #43, #53 | 10 Nov, 18 Nov |
| CI/CD: end-to-end test, Docker image, publish and deploy | Sanchita V G | #48 | 15 Nov |
| CampusPark React web app (NFR usability, D-2) | Sanchita V G | #49 | 15 Nov |
| Login, hashed passwords and admin roles (NFR security, D-1) | Sanchita V G | #50 | 18 Nov |
| Pipeline split into `ci.yml` and `cd.yml` | Sanchita V G | #52 | 18 Nov |
| Sprint 2 demo video | Shiva Nandan R | #41 | 31 Oct |

Process items:

- Every feature was raised as a pull request by its owner and merged into `main`.
- CI (`.github/workflows/ci.yml`) runs on every push and pull request: lint,
  unit tests with coverage, a smoke test against MongoDB, the front-end build, the
  test reports and a Docker image test.
- CD (`.github/workflows/cd.yml`) runs after CI passes on `main`. It publishes
  the Docker image to GitHub Container Registry, deploys it to Render, waits for
  the new version to go live and smoke tests the live site.

## Sprint 3 (Testing)

Sprint 3 was a dedicated testing sprint, following the Test Plan (sections 5, 13
and 14).

| Item | Owner | Pull requests | Merged |
|---|---|---|---|
| White-box unit tests for branch coverage (70 → 164 tests) | Sanchita V G | #51 | 18 Nov |
| Black-box system suite traced to the Test Plan (87 cases) | Sanchita V G | #51 | 18 Nov |
| Performance testing, VPS-NF-001..003 (TC-PERF-01..04) | Sanchita V G | #51 | 18 Nov |
| Coverage, white-box, black-box, traceability and test summary reports | Sanchita V G | #51 | 18 Nov |
| Fix for DEF-02 (double booking under simultaneous requests) | Sanchita V G | #51 | 18 Nov |
| Live deployment checked after every release | Sanchita V G | #54 | 18 Nov |

Results (from [`reports/TEST_SUMMARY_REPORT.md`](reports/TEST_SUMMARY_REPORT.md)):

- 164 unit tests and 87 black-box tests, all passing.
- Coverage of the back end: about 98% of statements and 96% of branches (exact
  figures in [`reports/COVERAGE_REPORT.md`](reports/COVERAGE_REPORT.md)).
- Every requirement in the Test Plan (VPS-F-001..014, VPS-NF-001..005) has
  passing tests; see the [traceability matrix](reports/TRACEABILITY_MATRIX.md).
- Response times measured on the local server were in the milliseconds, far
  inside the 2-5 s targets.

## Defects

| ID | Severity | Defect | Found | Fixed |
|---|---|---|---|---|
| DEF-01 | High | FR-7 reminders were never sent: a merge on 11 Nov dropped the line that loads the reminder module | 15 Nov, integration run (server log) | PR #50 |
| DEF-02 | Critical | Simultaneous booking requests could double-book one slot | 18 Nov, black-box test TC-RES-14 | PR #51 |

Both are retested and closed. No critical or high defects are open.

## Deployment

- **Hosting:** Render (free plan), building the repository's `Dockerfile`.
- **Database:** MongoDB Atlas (free M0 cluster), accessed by a database user
  limited to read and write.
- **Live URL:** https://g10-parking.onrender.com. The free plan sleeps after 15
  minutes without visitors, so the first request then takes about a minute.
- **Releases:** go out only through CD after CI passes. The live smoke test only
  reads data, so it writes nothing to the live database.

## Open items

- Database schema review (#19) and UI/UX and SRS compliance review (#20).

Deviations from the submitted SRS, SAD and Test Plan, and how each one ended, are
listed in [`DEVIATIONS.md`](DEVIATIONS.md).
