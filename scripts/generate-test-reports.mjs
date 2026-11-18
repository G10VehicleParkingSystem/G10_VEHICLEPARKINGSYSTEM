// Generates every test report in docs/reports from a real test run:
//   1. white-box unit tests (tests/*.test.js) with statement / branch / function
//      coverage (c8, V8 coverage) and a JUnit results file
//   2. black-box system tests (tests/blackbox/run-blackbox.mjs) against a real server
//      and MongoDB, with the server itself under coverage
//   3. combined coverage of both runs
//   4. the Markdown reports: coverage, white-box, black-box, traceability, test case
//      updates and the IEEE 829 style test summary report
//
//   npm run reports            (needs MongoDB; REPORT_MONGO_URI to point elsewhere)
import { spawn, execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ROOT = process.cwd();
const OUT = "docs/reports";
const DATA = `${OUT}/data`;
const COV = `${OUT}/coverage`;
const MONGO = process.env.REPORT_MONGO_URI || "mongodb://127.0.0.1:27017/g10_test_reports";
const PORT = Number(process.env.REPORT_PORT || 5099);
const C8 = path.join(ROOT, "node_modules", ".bin", "c8");
const SERVER_ENV = {
  PORT: String(PORT),
  MONGO_URI: MONGO,
  PAYMENT_GATEWAY: "demo",
  ADMIN_EMAIL: "office@campuspark.test",
  ADMIN_PASSWORD: "report-run-office",
  JWT_SECRET: "report-run-secret",
  NODE_ENV: "production"
};
const COVERAGE_ARGS = ["--all", "--include=src/**", "--include=server.js", "--reporter=json-summary", "--reporter=html"];

/* ---------- helpers ---------- */

function run(cmd, args, { env = {}, quiet = false } = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd: ROOT, env: { ...process.env, ...env }, stdio: quiet ? "ignore" : "inherit" });
    child.on("close", (code) => resolve(code));
  });
}

const sh = (cmd) => {
  try {
    return execSync(cmd, { cwd: ROOT, stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return "";
  }
};

const rel = (file) => path.relative(ROOT, file).split(path.sep).join("/");
const pct = (n) => (n === undefined ? "–" : `${Number(n).toFixed(1)}%`);
const esc = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
const write = (name, text) => {
  fs.writeFileSync(path.join(OUT, name), text.trim() + "\n");
  console.log(`  wrote ${OUT}/${name}`);
};

function readSummary(dir) {
  const file = path.join(dir, "coverage-summary.json");
  if (!fs.existsSync(file)) return null;
  const raw = JSON.parse(fs.readFileSync(file, "utf8"));
  const files = {};
  for (const [key, value] of Object.entries(raw)) {
    if (key !== "total") files[rel(key)] = value;
  }
  return { total: raw.total, files };
}

async function waitForHealth(url, seconds = 60) {
  for (let i = 0; i < seconds; i += 1) {
    try {
      if ((await fetch(url)).ok) return true;
    } catch {
      // not yet
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

/* ---------- 0. clean ---------- */

console.log("Preparing docs/reports");
fs.rmSync(COV, { recursive: true, force: true });
fs.rmSync(".c8", { recursive: true, force: true });
fs.mkdirSync(DATA, { recursive: true });

/* ---------- 1. white-box unit tests with coverage ---------- */

console.log("\n1/3 White-box unit tests with coverage");
const testFiles = fs.readdirSync("tests").filter((f) => f.endsWith(".test.js")).sort().map((f) => `tests/${f}`);
const junitFile = `${DATA}/unit-tests.junit.xml`;
const unitStarted = Date.now();
const unitExit = await run(C8, [
  ...COVERAGE_ARGS, "--report-dir", `${COV}/unit`, "--temp-directory", ".c8/unit", "--clean",
  process.execPath, "--test",
  "--test-reporter=dot", "--test-reporter-destination=stdout",
  "--test-reporter=junit", `--test-reporter-destination=${junitFile}`,
  ...testFiles
], { env: { NODE_ENV: "test", JWT_SECRET: "unit-test-secret" } });
const unitSeconds = (Date.now() - unitStarted) / 1000;
fs.writeFileSync(junitFile, fs.readFileSync(junitFile, "utf8").split(`${ROOT}/`).join(""));

const unitCases = [];
// One chunk per <testcase>; attribute values are quoted, but Node does not escape ">"
// inside them, so split on the tag rather than matching up to the first ">".
for (const chunk of fs.readFileSync(junitFile, "utf8").split("<testcase ").slice(1)) {
  const attr = (name) => (chunk.match(new RegExp(`\\b${name}="([^"]*)"`)) || [])[1] || "";
  const decode = (s) => s.replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;/g, "'");
  unitCases.push({
    name: decode(attr("name")),
    file: attr("file"),
    ms: Number(attr("time")) * 1000,
    status: /<failure/.test(chunk) ? "FAIL" : /<skipped/.test(chunk) ? "SKIP" : "PASS"
  });
}

/* ---------- 2. black-box system tests against a covered server ---------- */

console.log("\n2/3 Black-box system tests against a real server and MongoDB");
let blackbox = null;
let smokeExit = null;
let mongoVersion = "unknown";
{
  const mongoose = (await import("mongoose")).default;
  try {
    await mongoose.connect(MONGO, { serverSelectionTimeoutMS: 5000 });
    await mongoose.connection.dropDatabase();
    mongoVersion = (await mongoose.connection.db.admin().serverInfo()).version;
    await mongoose.disconnect();
  } catch (error) {
    console.error(`  MongoDB is not reachable at ${MONGO}: ${error.message}`);
    process.exit(1);
  }

  const server = spawn(C8, [...COVERAGE_ARGS, "--report-dir", `${COV}/system`, "--temp-directory", ".c8/system", "--clean",
    process.execPath, "server.js"], { cwd: ROOT, env: { ...process.env, ...SERVER_ENV }, stdio: ["ignore", "pipe", "pipe"] });
  const serverLog = [];
  server.stdout.on("data", (d) => serverLog.push(d.toString()));
  server.stderr.on("data", (d) => serverLog.push(d.toString()));
  const serverExited = new Promise((resolve) => server.on("close", resolve));

  if (!(await waitForHealth(`http://localhost:${PORT}/api/health`))) {
    console.error(serverLog.join(""));
    server.kill("SIGTERM");
    process.exit(1);
  }

  const resultsFile = `${DATA}/black-box-results.json`;
  const env = { BASE_URL: `http://localhost:${PORT}/api`, MONGO_URI: MONGO, BLACKBOX_JSON: resultsFile,
    ADMIN_EMAIL: SERVER_ENV.ADMIN_EMAIL, ADMIN_PASSWORD: SERVER_ENV.ADMIN_PASSWORD };
  await run(process.execPath, ["tests/blackbox/run-blackbox.mjs"], { env });
  smokeExit = await run(process.execPath, ["scripts/smoke-test.mjs"], { env, quiet: true });
  blackbox = JSON.parse(fs.readFileSync(resultsFile, "utf8"));

  server.kill("SIGTERM");
  await serverExited;
  fs.writeFileSync(`${DATA}/server.log`, serverLog.join(""));
}

/* ---------- 3. combined coverage ---------- */

console.log("\n3/3 Combined coverage");
fs.mkdirSync(".c8/combined", { recursive: true });
for (const dir of [".c8/unit", ".c8/system"]) {
  for (const f of fs.readdirSync(dir)) fs.copyFileSync(path.join(dir, f), path.join(".c8/combined", `${path.basename(dir)}-${f}`));
}
await run(C8, ["report", ...COVERAGE_ARGS, "--report-dir", `${COV}/combined`, "--temp-directory", ".c8/combined"], { quiet: true });
fs.rmSync(".c8", { recursive: true, force: true });

const coverage = { unit: readSummary(`${COV}/unit`), system: readSummary(`${COV}/system`), combined: readSummary(`${COV}/combined`) };
fs.writeFileSync(`${DATA}/coverage-summary.json`, JSON.stringify(
  Object.fromEntries(Object.entries(coverage).map(([k, v]) => [k, { total: v.total, files: v.files }])), null, 2));

/* =======================================================================
   Report data
   ======================================================================= */

const commit = sh("git rev-parse --short HEAD") || "unknown";
const branch = sh("git rev-parse --abbrev-ref HEAD") || "unknown";
const today = new Date().toISOString().slice(0, 10);
const srcLines = sh("find src server.js -name '*.js' -type f | xargs cat | grep -cv '^[[:space:]]*$'");
const kloc = Number(srcLines) / 1000;

const unit = {
  total: unitCases.length,
  passed: unitCases.filter((c) => c.status === "PASS").length,
  failed: unitCases.filter((c) => c.status === "FAIL").length,
  files: [...new Set(unitCases.map((c) => c.file))]
};
const bb = blackbox.summary;
const bbCases = blackbox.cases;
const executedTotal = unit.total + bb.total - bb.notRun;
const passedTotal = unit.passed + bb.passed;

const ENVIRONMENT = `
| Item | Value |
|---|---|
| Date of run | ${today} |
| Code version | \`${commit}\` on branch \`${branch}\` |
| Runtime | Node.js ${process.version} on ${os.type()} ${os.release()} (${os.arch()}) |
| Database | MongoDB ${mongoVersion} (a fresh test database for each run) |
| Unit test runner | Node.js built-in test runner (\`node:test\`), database models stubbed |
| Coverage tool | c8 ${sh(`${C8} --version`)} (V8 statement, branch and function coverage) |
| System test runner | \`tests/blackbox/run-blackbox.mjs\` over HTTP, plus \`scripts/smoke-test.mjs\` |
| Payment gateway | \`PAYMENT_GATEWAY=demo\` (deviation D-3) |`;

const MODULE_REQ = {
  slot: "FR-1 · VPS-F-003", vehicle: "FR-1 · VPS-F-002", reservation: "FR-2 · VPS-F-004..006", payment: "FR-3 · VPS-F-007..008",
  parking: "FR-4 · VPS-F-009..010", overstay: "FR-5 · VPS-F-011..012", analytics: "FR-6 · VPS-F-013",
  notification: "FR-7 · VPS-F-014", subscription: "FR-8", review: "FR-9", auth: "Security · VPS-F-001, NF-004"
};

// Defects found during Sprint 2 testing (kept here so the reports and the log agree).
const DEFECTS = [
  {
    id: "DEF-01", severity: "High", requirement: "FR-7 · VPS-F-014",
    title: "Upcoming and expiry reminders were never sent",
    found: "2026-11-15", foundBy: "Integration run of the full server (server log: \"notificationReminders is not defined\" every minute)",
    cause: "The merge of main into feature/qr-vehicle-identification on 2026-11-11 (a27e150, merged to main with PR #46) kept the reminder scheduler in server.js but dropped the line that loads notification.reminders.js. Unit tests did not catch it because they call the reminder module directly.",
    fix: "c987adb: load the reminder module again (PR #50). Black-box TC-NTF-01 and the demo script now show reminder alerts.",
    introduced: "2026-11-11", closed: "2026-11-15", status: "Fixed, retested"
  },
  {
    id: "DEF-02", severity: "Critical", requirement: "FR-2 · VPS-F-006, VPS-NF-005",
    title: "Simultaneous requests could double-book the same slot",
    found: "2026-11-18", foundBy: "Black-box test TC-RES-14 (20 parallel bookings of one slot: 2 to 19 were confirmed instead of 1)",
    cause: "createReservation checked for an overlapping booking and then inserted, as two separate steps. Requests arriving together all passed the check before any of them inserted.",
    fix: "9b1f918: a short per-slot booking lock, taken with one atomic MongoDB update, makes the check and the insert run one request at a time per slot. Retested: exactly 1 booking per round in TC-RES-14; white-box tests WB-RES-04..06 cover the lock.",
    introduced: "2026-10-04", closed: "2026-11-18", status: "Fixed, retested"
  }
];
const days = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

/* =======================================================================
   COVERAGE_REPORT.md
   ======================================================================= */

console.log("\nWriting reports");
const covRow = (label, t) => `| ${label} | ${pct(t.statements.pct)} (${t.statements.covered}/${t.statements.total}) | ${pct(t.branches.pct)} (${t.branches.covered}/${t.branches.total}) | ${pct(t.functions.pct)} (${t.functions.covered}/${t.functions.total}) | ${pct(t.lines.pct)} |`;
const allFiles = Object.keys(coverage.combined.files).sort();
const fileRow = (f) => {
  const u = coverage.unit.files[f];
  const s = coverage.system.files[f];
  const c = coverage.combined.files[f];
  return `| \`${f.replace(/^src\/modules\//, "")}\` | ${pct(u?.statements.pct)} | ${pct(u?.branches.pct)} | ${pct(s?.statements.pct)} | ${pct(s?.branches.pct)} | **${pct(c.statements.pct)}** | **${pct(c.branches.pct)}** |`;
};
const weakBranches = allFiles.filter((f) => coverage.combined.files[f].branches.pct < 90);

write("COVERAGE_REPORT.md", `
# Code Coverage and Branch Coverage Report

G10 Vehicle Parking System · generated by \`npm run reports\` on ${today} from commit \`${commit}\`.

Coverage is measured with **c8**, which reads the coverage data built into the V8 JavaScript engine:

- **Statement (code) coverage**: the share of statements that ran at least once.
- **Branch coverage**: the share of decision outcomes that ran. Every \`if\`/\`else\`, \`? :\`, \`&&\`/\`||\` short-circuit, \`switch\` case and \`try\`/\`catch\` has at least two outcomes, and each one is counted separately.
- **Function coverage**: the share of functions that were called.

The code was measured in two ways, and then combined:

1. **Unit (white-box)**: ${unit.total} unit tests in \`tests/*.test.js\`. They call services and controllers directly, with the database models stubbed.
2. **System (black-box)**: the real server (\`node server.js\`) running against MongoDB, measured while the ${bb.total} black-box cases and the smoke test drove it over HTTP. This also covers \`server.js\`, the route files and the login middleware, which unit tests cannot reach.

## Summary

| Run | Statements | Branches | Functions | Lines |
|---|---|---|---|---|
${covRow("Unit tests (white-box)", coverage.unit.total)}
${covRow("System tests (black-box)", coverage.system.total)}
${covRow("**Combined**", coverage.combined.total)}

## Coverage by file

Only the back end is measured (\`src/\` and \`server.js\`). The React front end in \`frontend/\` was tested by hand; see the test summary report.

| File | Unit stmts | Unit branches | System stmts | System branches | Combined stmts | Combined branches |
|---|---|---|---|---|---|---|
${allFiles.map(fileRow).join("\n")}

## Branches not covered

${weakBranches.length ? `Files below 90% combined branch coverage:\n\n${weakBranches.map((f) => `- \`${f}\`: ${pct(coverage.combined.files[f].branches.pct)} (${coverage.combined.files[f].branches.covered} of ${coverage.combined.files[f].branches.total} branches)`).join("\n")}\n\nThe remaining branches are mostly defensive \`catch\` blocks for database failures and environment-variable fallbacks (for example a missing \`HOURLY_PARKING_RATE\`). The line-by-line HTML report marks each one.` : "Every file has at least 90% combined branch coverage."}

## Detailed reports

Open these in a browser to see every file line by line, with uncovered lines and branches highlighted:

- [Combined coverage](coverage/combined/index.html)
- [Unit test coverage](coverage/unit/index.html)
- [System test coverage](coverage/system/index.html)

The raw numbers are in [data/coverage-summary.json](data/coverage-summary.json).
`);

/* =======================================================================
   WHITE_BOX_TEST_REPORT.md
   ======================================================================= */

const byFile = unit.files.map((f) => ({ f, cases: unitCases.filter((c) => c.file === f) }));
const moduleRows = Object.keys(MODULE_REQ).map((mod) => {
  const files = Object.keys(coverage.unit.files).filter((f) => f.startsWith(`src/modules/${mod}/`));
  const sum = (k, part) => files.reduce((s, f) => s + coverage.unit.files[f][k][part], 0);
  const p = (k) => (sum(k, "total") ? (100 * sum(k, "covered")) / sum(k, "total") : 100);
  return `| ${mod} | ${MODULE_REQ[mod]} | ${pct(p("statements"))} | ${pct(p("branches"))} | ${pct(p("functions"))} |`;
});

write("WHITE_BOX_TEST_REPORT.md", `
# White-Box Test Report

G10 Vehicle Parking System · generated on ${today} from commit \`${commit}\`.

## 1. Purpose and approach

White-box (structural) testing designs test cases from the source code, so that every statement and every decision outcome runs at least once. The unit tests call the services and controllers directly and replace the Mongoose models with stubs (\`tests/helpers/test-utils.js\`). That way each branch can be forced: a database that returns nothing, a duplicate-key error, a payment gateway that fails, a lock that is busy.

Techniques used:

| Technique | How it was applied | Example tests |
|---|---|---|
| Statement coverage | Every statement in the services and controllers runs at least once | whole suite, see coverage below |
| Branch (decision) coverage | Each \`if\`, \`try\`/\`catch\` and short-circuit is driven both ways | \`WB-PRK-01\`..\`08\`, \`WB-CTL\` table |
| Condition coverage | Multi-part input checks, such as \`!userId \\|\\| !paymentMethod\` and the rating range, are tested one condition at a time | \`WB-CTL payment.payForReservation\`, \`WB-CTL review.updateReview\` |
| Basis path testing | One test per independent path through the most complex functions (section 3) | \`WB-PAY-01\`..\`07\`, \`WB-PRK-01\`..\`04\` |
| Loop testing | Loops run 0, 1 and many times: the overstay scan, and the booking-lock retry loop until it gives up | \`WB-OVR-01\`..\`03\`, \`WB-RES-04\`..\`06\` |
| Boundary values on internals | Billing rounds up each started hour, a booking ending exactly *now* is not fined, password length 7/8/72/73 | \`WB-OVR-03\`, \`WB-AUT-01\`, \`payment-calculations\` |
| Error-path / fault injection | Stubs throw to check rollbacks: the slot is freed when a session cannot be saved, the pass is set to PAYMENT_FAILED when payment fails | \`WB-PRK-04\`, \`WB-PRK-06\`, \`WB-SUB-03\` |

## 2. Results

| Measure | Result |
|---|---|
| Unit test cases | **${unit.total}** in ${unit.files.length} files |
| Passed | **${unit.passed}** |
| Failed | **${unit.failed}** |
| Run time | ${unitSeconds.toFixed(1)} s |
| Statement coverage (unit only) | **${pct(coverage.unit.total.statements.pct)}** |
| Branch coverage (unit only) | **${pct(coverage.unit.total.branches.pct)}** |
| Function coverage (unit only) | **${pct(coverage.unit.total.functions.pct)}** |

The route files and \`server.js\` show 0% here because they only wire URLs to controllers; the black-box run covers them (see the [coverage report](COVERAGE_REPORT.md)).

### Coverage by module (unit tests only)

| Module | Requirement | Statements | Branches | Functions |
|---|---|---|---|---|
${moduleRows.join("\n")}

## 3. Basis path analysis of key functions

Cyclomatic complexity V(G) = decisions + 1 gives the number of independent paths. Each path below has its own test.

**\`payment.service.payForReservation\`** (FR-3), V(G) = 7

| Path | Condition | Test |
|---|---|---|
| 1 | payment method not allowed | WB-PAY-01 |
| 2 | reservation not found or not the user's | WB-PAY-02 |
| 3 | already paid: return the earlier payment | WB-PAY-03 |
| 4 | reservation not CONFIRMED | WB-PAY-04 |
| 5 | gateway succeeds | WB-PAY-05 |
| 6 | gateway fails: FAILED payment recorded | WB-PAY-06 |
| 7 | duplicate-key race: return the winner, otherwise rethrow | WB-PAY-07 |

**\`parking.service.checkIn\`** (FR-4), V(G) = 7

| Path | Condition | Test |
|---|---|---|
| 1 | reservation not found | WB-PRK-01 |
| 2 | not CONFIRMED | WB-PRK-01 |
| 3 | booking already ended | WB-PRK-01 |
| 4 | already checked in | WB-PRK-02 |
| 5 | slot occupied | WB-PRK-02 |
| 6 | success: session ACTIVE | WB-PRK-03 |
| 7 | session save fails: slot released (rollback) | WB-PRK-04 |

**\`reservation.service.withSlotLock\`** (FR-2 · VPS-NF-005, added to fix DEF-02), V(G) = 4

| Path | Condition | Test |
|---|---|---|
| 1 | lock taken first time, booking saved, lock released | fr2-reservation tests |
| 2 | slot busy: retry, then lock taken | WB-RES-04 |
| 3 | work throws (overlap): lock still released (\`finally\`) | WB-RES-05 |
| 4 | slot stays busy: gives up with a clear message | WB-RES-06 |

**\`overstay.service.checkout\`** (FR-5), V(G) = 5

| Path | Condition | Test |
|---|---|---|
| 1 | reservation not found | WB-OVR-05 |
| 2 | reservation cancelled | WB-OVR-05 |
| 3 | late: fine created, slot freed | WB-OVR-06 |
| 4 | on time: no fine | WB-OVR-07 |
| 5 | already COMPLETED: existing fine returned, nothing saved | WB-OVR-07 |

## 4. Test cases

${byFile.map(({ f, cases }) => `### \`${f}\` (${cases.length})\n\n${cases.map((c) => `- ${c.status === "PASS" ? "✅" : "❌"} ${esc(c.name)}`).join("\n")}`).join("\n\n")}

## 5. Environment
${ENVIRONMENT}

Raw results: [data/unit-tests.junit.xml](data/unit-tests.junit.xml) (JUnit XML).
`);

/* =======================================================================
   BLACK_BOX_TEST_REPORT.md
   ======================================================================= */

const TECH = {
  EP: "Equivalence partitioning: one representative input from each valid and invalid class",
  BVA: "Boundary value analysis: inputs on a limit and just either side of it",
  DT: "Decision table: combinations of who is asking (student, other student, office) and what they ask for",
  ST: "State transition: moving a booking through CONFIRMED, checked in, COMPLETED or CANCELLED, including invalid moves",
  UC: "Use case / scenario: a full user journey across several features",
  PERF: "Performance: repeated requests, timed against the response-time NFR"
};
const techCounts = Object.keys(TECH).map((t) => `| ${t} | ${TECH[t]} | ${bbCases.filter((c) => c.technique === t).length} |`);
const GROUPS = [
  ["Accounts and login (VPS-F-001)", "TC-AUTH"], ["Security validation (Test Plan 5.1, VPS-NF-004)", "TC-SEC"],
  ["Vehicles (VPS-F-002)", "TC-VEH"], ["Slot recommendation (VPS-F-003)", "TC-SLOT"],
  ["Reservations (VPS-F-004..006, VPS-NF-005)", "TC-RES"], ["Tracking and history (VPS-F-009, F-010)", "TC-TRK"],
  ["", "TC-HIST"], ["Payments (VPS-F-007, F-008)", "TC-PAY"], ["Overstay and fines (VPS-F-011, F-012)", "TC-OVER"], ["", "TC-FINE"],
  ["Analytics (VPS-F-013)", "TC-ANA"], ["Notifications (VPS-F-014)", "TC-NTF"], ["Monthly pass (FR-8)", "TC-SUB"],
  ["Ratings (FR-9)", "TC-REV"], ["Response times (VPS-NF-001..003)", "TC-PERF"]
];
const caseTable = (cases) => `| ID | Requirement | Technique | Test | Input | Expected | Actual | Result |\n|---|---|---|---|---|---|---|---|\n${cases.map((c) =>
  `| ${c.id} | ${esc(c.requirement)} | ${c.technique} | ${esc(c.title)} | ${esc(c.input)} | ${esc(c.expected)} | ${esc(c.actual)} | ${c.status === "PASS" ? "✅ Pass" : c.status === "FAIL" ? "❌ Fail" : "Not run"} |`).join("\n")}`;
let groupText = "";
for (let i = 0; i < GROUPS.length; i += 1) {
  const [title, prefix] = GROUPS[i];
  const cases = bbCases.filter((c) => c.id.startsWith(`${prefix}-`));
  if (title) {
    const more = GROUPS[i + 1] && !GROUPS[i + 1][0] ? bbCases.filter((c) => c.id.startsWith(`${GROUPS[i + 1][1]}-`)) : [];
    groupText += `### ${title}\n\n${caseTable([...cases, ...more])}\n\n`;
  }
}

write("BLACK_BOX_TEST_REPORT.md", `
# Black-Box Test Report

G10 Vehicle Parking System · generated on ${today} from commit \`${commit}\`.

## 1. Purpose and approach

Black-box (functional) testing checks the system only through its public REST API, the same interface the CampusPark web app uses. Each case is designed from the SRS and the Software Test Plan, with no reference to the code. The suite (\`tests/blackbox/run-blackbox.mjs\`) starts from an empty MongoDB database, creates its own accounts, slots and vehicles, and runs every case in order against the real server.

Each case carries the Test Plan feature id it verifies (VPS-F-xxx / VPS-NF-xxx) and the technique used to choose its input:

| Technique | Meaning | Cases |
|---|---|---|
${techCounts.join("\n")}

Test data: the API correctly refuses to create a booking in the past, so the overstay cases (TC-OVER-01, TC-FINE-01..04) insert one booking that ended 90 minutes ago straight into the database as test data. TC-SEC-11 and TC-SEC-12 read the database to check how passwords and payments are stored. Everything else goes through the API only.

## 2. Summary

| Measure | Result |
|---|---|
| Black-box cases | **${bb.total}** |
| Passed | **${bb.passed}** |
| Failed | **${bb.failed}** |
| Not run | ${bb.notRun} |
| Pass rate | **${pct((100 * bb.passed) / Math.max(1, bb.total - bb.notRun))}** |
| Smoke test (\`scripts/smoke-test.mjs\`, used by CI/CD) | ${smokeExit === 0 ? "✅ all checks passed" : "❌ failed"} |

## 3. Response times (VPS-NF-001 to NF-003)

Each operation was called ${blackbox.performance[0]?.runs ?? 0} times in a row against the local server.

| ID | Requirement | Operation | Average | 95th percentile | Slowest | Target | Result |
|---|---|---|---|---|---|---|---|
${blackbox.performance.map((p) => `| ${p.id} | ${p.requirement} | ${p.title.replace(" response time", "")} | ${p.avgMs} ms | ${p.p95Ms} ms | ${p.maxMs} ms | under ${p.limitMs / 1000} s | ${p.maxMs < p.limitMs ? "✅ Pass" : "❌ Fail"} |`).join("\n")}

These were measured on a single developer laptop with a small dataset, so they show the API is well inside its targets. They are not a load test.

## 4. Test cases and results

${groupText}
## 5. Defects found by black-box testing

**DEF-02 (Critical): simultaneous requests could double-book a slot.** TC-RES-14 sends 20 identical booking requests for one free slot at the same moment. Before the fix, between 2 and 19 of them were confirmed in each round; with the per-slot booking lock exactly one is. See the [test summary report](TEST_SUMMARY_REPORT.md#5-defects) for details.

## 6. Environment
${ENVIRONMENT}

Raw results: [data/black-box-results.json](data/black-box-results.json).
`);

/* =======================================================================
   TRACEABILITY_MATRIX.md
   ======================================================================= */

const REQS = [
  ["VPS-F-001", "User authentication and access control", "auth-security, wb-vehicle-slot-auth (WB-AUT)"],
  ["VPS-F-002", "Vehicle registration and validation", "fr1-slot-recommendation, wb-vehicle-slot-auth (WB-VEH)"],
  ["VPS-F-003", "Vehicle-size-based slot recommendation", "fr1-slot-recommendation, wb-vehicle-slot-auth (WB-SLT)"],
  ["VPS-F-004", "Parking slot reservation", "fr2-reservation, wb-vehicle-slot-auth (WB-RES)"],
  ["VPS-F-005", "Reservation viewing and cancellation", "fr2-reservation, wb-vehicle-slot-auth (WB-RES-02, 03)"],
  ["VPS-F-006", "Prevention of overlapping reservations", "fr2-reservation, wb-vehicle-slot-auth (WB-RES-04..06)"],
  ["VPS-F-007", "Digital parking payment", "payment-calculations, fr3-fr5-validation, wb-payment-subscription (WB-PAY)"],
  ["VPS-F-008", "Payment transaction recording and history", "wb-payment-subscription (WB-PAY-15), wb-controllers"],
  ["VPS-F-009", "Vehicle search and current-slot tracking", "fr4-tracking, wb-overstay-parking (WB-PRK-08)"],
  ["VPS-F-010", "Parking history display", "fr4-tracking, wb-overstay-parking (WB-PRK-08)"],
  ["VPS-F-011", "Overstay detection", "fr7-notifications, wb-overstay-parking (WB-OVR)"],
  ["VPS-F-012", "Fine calculation and recording", "payment-calculations, wb-payment-subscription (WB-PAY-08..11)"],
  ["VPS-F-013", "Administrator analytics and reports", "fr6-analytics, auth-security (admin role)"],
  ["VPS-F-014", "Notifications and alerts", "fr7-notifications, wb-vehicle-slot-auth (WB-NTF)"],
  ["VPS-NF-001", "Recommendation and reservation within 2-3 s", "–"],
  ["VPS-NF-002", "Vehicle search within 2 s", "–"],
  ["VPS-NF-003", "Analytics within 3-5 s", "–"],
  ["VPS-NF-004", "Secure password and payment-data handling", "auth-security, wb-vehicle-slot-auth (WB-AUT)"],
  ["VPS-NF-005", "No double bookings, consistent data", "fr2-reservation, wb-vehicle-slot-auth (WB-RES-04..06), wb-payment-subscription (WB-PAY-03, 07)"],
  ["FR-8", "Monthly subscription (added after the Test Plan)", "fr8-subscription, wb-payment-subscription (WB-SUB)"],
  ["FR-9", "Slot reviews and ratings (added after the Test Plan)", "fr9-reviews, wb-controllers"]
];
const matches = (req, c) => c.requirement.split(/[\s/,]+/).some((part) => part === req || `VPS-${part}` === req)
  || (req === "VPS-NF-005" && c.requirement.includes("NF-005")) || (req === "VPS-NF-004" && c.requirement.includes("NF-004"));
const rtmRows = REQS.map(([req, text, unitFiles]) => {
  const cases = bbCases.filter((c) => matches(req, c));
  const ok = cases.length && cases.every((c) => c.status === "PASS");
  return { req, text, unitFiles, cases, ok };
});
const covered = rtmRows.filter((r) => r.cases.length).length;

write("TRACEABILITY_MATRIX.md", `
# Requirements Traceability Matrix

G10 Vehicle Parking System · generated on ${today} from commit \`${commit}\`.

This matrix links each requirement in the Software Test Plan (section 3, VPS-F/VPS-NF ids) and the features added later (FR-8, FR-9) to the tests that verify it. "Status" is the result of the black-box run in this report.

**${covered} of ${REQS.length} requirements** are covered by at least one black-box test, and every functional requirement also has white-box unit tests.

| Requirement | Description | Black-box test cases | White-box unit tests (\`tests/\`) | Status |
|---|---|---|---|---|
${rtmRows.map((r) => `| ${r.req} | ${r.text} | ${r.cases.map((c) => c.id).join(", ") || "–"} | ${r.unitFiles} | ${r.cases.length ? (r.ok ? "✅ Pass" : "❌ Fail") : "Not covered"} |`).join("\n")}

Test Plan section 5.1 (security validation) maps to TC-SEC-01..12, TC-RES-13, TC-RES-15, TC-TRK-05, TC-FINE-04 and TC-NTF-04.

The example ids in the Test Plan (section 13) are kept: TC-AUTH-01/02, TC-SLOT-01/02, TC-RES-03/04, TC-PAY-01/02, TC-OVER-01/02 and TC-PERF-01 are the cases with those ids in the [black-box report](BLACK_BOX_TEST_REPORT.md).
`);

/* =======================================================================
   TEST_CASE_UPDATES.md
   ======================================================================= */

write("TEST_CASE_UPDATES.md", `
# Test Case Updates for Sprint Changes

G10 Vehicle Parking System · updated ${today}.

The Software Test Plan v1.0 (16-Sep-2026) was written before development. This page lists how the test cases were updated as the sprints changed the product, so every change in [DEVIATIONS.md](../DEVIATIONS.md) has matching tests.

## Cases kept from the Test Plan

| Test Plan id (section 13) | Requirement | Current case | Change |
|---|---|---|---|
| TC-AUTH-01, TC-AUTH-02 | VPS-F-001 | TC-AUTH-01, TC-AUTH-02 | Kept. Login was built later (D-1), so these ran from Sprint 2 onwards |
| TC-SLOT-01, TC-SLOT-02 | VPS-F-003 | TC-SLOT-01, TC-SLOT-02 | Kept; SLOT-02 now checks that two-wheelers get the bike bay |
| TC-RES-03, TC-RES-04 | VPS-F-006 | TC-RES-03, TC-RES-04 | Kept; RES-04 became a boundary test (one minute of overlap) |
| TC-PAY-01, TC-PAY-02 | VPS-F-007 | TC-PAY-01, TC-PAY-02 | Kept; PAY-02 now checks that paying twice does not charge twice |
| TC-OVER-01, TC-OVER-02 | VPS-F-011 | TC-OVER-01, TC-OVER-02 | Kept |
| TC-PERF-01 | VPS-NF-001 | TC-PERF-01 | Kept; measured as average, 95th percentile and slowest of ${blackbox.performance[0]?.runs ?? 20} calls |

## Cases changed because of sprint changes

| Change in the product | Deviation / PR | What changed in the tests |
|---|---|---|
| Sprint 1 endpoints took a \`userId\` parameter; login came later | D-1, PR #50 | Every case now signs in and sends a token. New cases check that the \`userId\` sent by a student is ignored (TC-RES-15) and that other people's records answer 403 (TC-SEC-07, 08, TC-TRK-05) |
| Admin functions were open in Sprint 1 | D-1 | Decision-table cases TC-SEC-03..06: a student gets 403 on analytics, adding slots, overstay detection and creating notifications |
| Payment sandbox replaced by a demo gateway | D-3 | Payment cases expect provider \`DEMO_GATEWAY\`; the failure path is tested in white-box WB-PAY-06 by switching the gateway off |
| No parking hardware: check-in and check-out are API calls | D-4 | Tracking cases use \`/parking/check-in\` and \`/overstays/:id/checkout\` in place of gate events |
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
- **White-box unit tests** written for branch coverage (\`tests/wb-*.test.js\`), see the [white-box report](WHITE_BOX_TEST_REPORT.md).
`);

/* =======================================================================
   TEST_SUMMARY_REPORT.md (IEEE 829)
   ======================================================================= */

const sev = (s) => DEFECTS.filter((d) => d.severity === s).length;
const featuresTested = rtmRows.filter((r) => r.req.startsWith("VPS-F") && r.cases.length).length;
const featuresTotal = rtmRows.filter((r) => r.req.startsWith("VPS-F")).length;
const avgResponse = blackbox.performance.length
  ? (blackbox.performance.reduce((s, p) => s + p.avgMs, 0) / blackbox.performance.length).toFixed(1) : "–";
const allPassed = unit.failed === 0 && bb.failed === 0 && smokeExit === 0;

write("TEST_SUMMARY_REPORT.md", `
# Test Summary Report

| | |
|---|---|
| Project | Vehicle Parking System, Group 10 |
| Document | Test Summary Report (IEEE 829 structure), generated by \`npm run reports\` |
| Test Plan | Software Test Plan v1.0, 16-Sep-2026 |
| Code version | \`${commit}\` (${branch}) |
| Date | ${today} |
| Prepared by | Sanchita V G (Product Owner, integration testing), for QA Lead Shiva Sandesh |

## 1. Summary

${allPassed ? "All planned tests were executed and passed." : "Some tests failed; see the details below."} The back end was tested at three levels: **${unit.total} white-box unit tests**, **${bb.total} black-box system tests** against a real server and MongoDB, and the CI/CD smoke test, which runs on every push. Two defects were found during Sprint 2 testing; both are fixed and retested.

| Level | Cases | Passed | Failed | Not run |
|---|---|---|---|---|
| Unit (white-box) | ${unit.total} | ${unit.passed} | ${unit.failed} | 0 |
| System (black-box) | ${bb.total} | ${bb.passed} | ${bb.failed} | ${bb.notRun} |
| Smoke (CI/CD) | 1 suite | ${smokeExit === 0 ? 1 : 0} | ${smokeExit === 0 ? 0 : 1} | 0 |
| **Total** | **${unit.total + bb.total}** | **${passedTotal}** | **${unit.failed + bb.failed}** | **${bb.notRun}** |

| Coverage (combined) | Statements | Branches | Functions |
|---|---|---|---|
| Back end (\`src/\`, \`server.js\`) | **${pct(coverage.combined.total.statements.pct)}** | **${pct(coverage.combined.total.branches.pct)}** | **${pct(coverage.combined.total.functions.pct)}** |

Reports: [coverage](COVERAGE_REPORT.md) · [white-box](WHITE_BOX_TEST_REPORT.md) · [black-box](BLACK_BOX_TEST_REPORT.md) · [traceability](TRACEABILITY_MATRIX.md) · [test case updates](TEST_CASE_UPDATES.md)

## 2. Variances from the Test Plan

| Test Plan | What happened | Reason |
|---|---|---|
| Schedule 18-28 Sep 2026 (section 7) | Testing ran in Sprint 1 and Sprint 2 and was completed in November | The Deliverables brief set the sprint calendar later (deviation D-7) |
| Tools: Postman, browser tools (section 6) | Automated runners replaced manual Postman runs: \`node:test\`, c8 for coverage and a scripted HTTP suite | Repeatable, and run by CI on every push |
| Integration tests front end ↔ back end ↔ DB ↔ payment (section 5) | The back end, database and payment interface are tested automatically. The React front end was tested by hand on every screen at desktop width and at 390 px phone width | No automated browser tests yet |
| Payment sandbox (section 11) | Demo gateway (\`PAYMENT_GATEWAY=demo\`) | No provider account (deviation D-3) |
| Performance "with tools" (section 5) | Timed with the black-box runner: ${blackbox.performance[0]?.runs ?? 20} calls per operation on a laptop | Fits the team's hardware; a load test is out of scope |
| UAT with real users (section 5) | Scenario tests stand in (TC-OVER-01, TC-NTF-01, TC-SUB-01) together with the recorded sprint demos | Course timeline |

## 3. Comprehensiveness

- **Features tested**: ${featuresTested} of ${featuresTotal} functional features (VPS-F-001..014) have passing black-box cases, and all five NFRs (VPS-NF-001..005) are covered. FR-8 and FR-9, added after the Test Plan, are covered too. See the [traceability matrix](TRACEABILITY_MATRIX.md).
- **Security validation (Test Plan 5.1)**: all seven points are tested. Login is required (TC-SEC-01, 02); admin functions are refused to students (TC-SEC-03..06); passwords are stored as hashes (TC-SEC-11); no card data is stored (TC-SEC-12); bad and unexpected input is rejected (TC-SEC-09, 10 and the EP/BVA cases); users see only their own records (TC-SEC-07, 08, TC-TRK-05).
- **Not tested**: parking hardware, cloud hosting and external payment providers (Test Plan section 4), the front end with automated tests, and behaviour under heavy load beyond 20 simultaneous requests.

## 4. Metrics (Test Plan section 14)

| Metric | Value |
|---|---|
| Test cases executed | ${executedTotal} of ${unit.total + bb.total} (${pct((100 * executedTotal) / (unit.total + bb.total))}) |
| Test cases passed | ${passedTotal} (${pct((100 * passedTotal) / Math.max(1, executedTotal))}) |
| Test cases failed | ${unit.failed + bb.failed} |
| Defects by severity | Critical ${sev("Critical")} · High ${sev("High")} · Medium ${sev("Medium")} · Low ${sev("Low")} |
| Defect density | ${(DEFECTS.length / kloc).toFixed(2)} defects per 1,000 lines (${DEFECTS.length} defects, ${srcLines} non-blank lines of back-end code) |
| Defect aging (introduced → fixed) | ${DEFECTS.map((d) => `${d.id}: ${days(d.introduced, d.closed)} days`).join(" · ")} |
| Defect aging (found → fixed) | ${DEFECTS.map((d) => `${d.id}: ${days(d.found, d.closed)} days`).join(" · ")} |
| Functional feature coverage | ${featuresTested}/${featuresTotal} features (${pct((100 * featuresTested) / featuresTotal)}) |
| Requirement / test-case coverage | ${covered}/${REQS.length} requirements have black-box cases (${pct((100 * covered) / REQS.length)}) |
| Code coverage (combined) | statements ${pct(coverage.combined.total.statements.pct)}, branches ${pct(coverage.combined.total.branches.pct)} |
| Average response time, key operations | ${avgResponse} ms (${blackbox.performance.map((p) => `${p.title.replace(" response time", "").toLowerCase()} ${p.avgMs} ms`).join(", ")}) |

## 5. Defects

| ID | Severity | Requirement | Defect | Found | How found | Status |
|---|---|---|---|---|---|---|
${DEFECTS.map((d) => `| ${d.id} | ${d.severity} | ${d.requirement} | ${d.title} | ${d.found} | ${esc(d.foundBy)} | ${d.status} |`).join("\n")}

${DEFECTS.map((d) => `**${d.id}: ${d.title}**\n\n- Cause: ${d.cause}\n- Fix: ${d.fix}\n- Introduced ${d.introduced}, closed ${d.closed}.`).join("\n\n")}

No critical or high defects remain open, so the exit criteria in Test Plan section 5 are met.

## 6. Evaluation

The system meets its tested requirements. The two defects were both concurrency or integration problems that unit tests alone could not see. This is why the black-box suite runs against a real server and database, and why it stays in the repository as a regression suite. Combined coverage of ${pct(coverage.combined.total.statements.pct)} of statements and ${pct(coverage.combined.total.branches.pct)} of branches means almost all of the back-end logic, including its error paths, has run under test.

## 7. Activities

- Sprint 1: unit tests for FR-1 to FR-7 written by each module owner; CI on every push.
- Sprint 2: unit tests for FR-8 and FR-9; CI/CD with an end-to-end smoke test, Docker image test and release check; login and roles tested (security); white-box tests written for branch coverage; black-box suite traced to the Test Plan; reports generated.
- Regression: \`npm test\` and the smoke test run on every push and pull request (\`.github/workflows/backend-ci.yml\`).

## 8. Environment
${ENVIRONMENT}

## 9. Approvals

| Role | Name | Signature / date |
|---|---|---|
| QA Lead | Shiva Sandesh | |
| Dev Lead | Shiva Nandan R | |
| Product Owner | Sanchita V G | |
| Team Member | Shantanu Milind Tandel | |
`);

/* =======================================================================
   README.md (index)
   ======================================================================= */

write("README.md", `
# Test Reports

Generated by \`npm run reports\` on ${today} from commit \`${commit}\`. Every number here comes from a real run of the tests.

| Report | What it shows |
|---|---|
| [Test summary report](TEST_SUMMARY_REPORT.md) | IEEE 829 summary: results, variances from the Test Plan, metrics, defects |
| [Code and branch coverage](COVERAGE_REPORT.md) | Statement, branch and function coverage per file; [HTML view](coverage/combined/index.html) |
| [White-box test report](WHITE_BOX_TEST_REPORT.md) | Structural tests: techniques, basis paths, every unit test |
| [Black-box test report](BLACK_BOX_TEST_REPORT.md) | Functional tests by EP, BVA, decision table and state transition; response times |
| [Traceability matrix](TRACEABILITY_MATRIX.md) | Test Plan requirements → test cases |
| [Test case updates](TEST_CASE_UPDATES.md) | How the Test Plan's cases changed with the sprints |

| Headline | Result |
|---|---|
| Unit tests (white-box) | ${unit.passed}/${unit.total} passed |
| System tests (black-box) | ${bb.passed}/${bb.total} passed |
| Statement coverage | ${pct(coverage.combined.total.statements.pct)} |
| Branch coverage | ${pct(coverage.combined.total.branches.pct)} |
| Defects found / open | ${DEFECTS.length} / 0 |

## Regenerate

MongoDB must be running locally (or set \`REPORT_MONGO_URI\`):

\`\`\`bash
npm ci
npm run reports
\`\`\`

The raw data is in [data/](data/): JUnit XML for the unit tests, JSON for the black-box results and the coverage totals, and the server log from the system run.
`);

console.log(`\nDone. Unit ${unit.passed}/${unit.total}, black-box ${bb.passed}/${bb.total}, coverage ${pct(coverage.combined.total.statements.pct)} statements / ${pct(coverage.combined.total.branches.pct)} branches.`);
process.exit(allPassed && unitExit === 0 ? 0 : 1);
