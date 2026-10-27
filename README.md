# G10 Vehicle Parking System — Backend

Express + MongoDB backend implementing the seven functional requirements from
the G10 SRS:

- FR-1: Vehicle-Size-Based Smart Slot Allocation & Recommendation
- FR-2: Advanced Reservation & Cancellation
- FR-3: Digital Payment & Transaction History
- FR-4: Vehicle Tracking & Parking History
- FR-5: Overstay Detection & Fines
- FR-6: Admin Analytics & Reports
- FR-7: Notifications & Alerts

Sprint documentation lives in [`docs/`](docs): the
[Sprint 1 report](docs/SPRINT1_REPORT.md) and the
[deviations from the submitted documents](docs/DEVIATIONS.md).

## Requirements

- Node.js 18+
- MongoDB running locally
- npm

## Run

```bash
cp .env.example .env      # Windows: copy .env.example .env
npm install
npm start
```

Server: http://localhost:5000

Health check: `GET /api/health`

Run the unit tests (no database needed):

```bash
npm test
```

## Configuration

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | 5000 | HTTP port |
| `MONGO_URI` | `mongodb://127.0.0.1:27017/g10_vehicle_parking` | MongoDB connection |
| `PAYMENT_GATEWAY` | unset | Set to `demo` to simulate successful payments |
| `HOURLY_PARKING_RATE` | 50 | INR per started hour of a reservation |
| `FINE_PER_HOUR` | 100 | INR per started hour of overstay |
| `OVERSTAY_CHECK_INTERVAL_MS` | 60000 | How often overstays and reminders are checked |
| `UPCOMING_REMINDER_MINUTES` | 30 | Notify this long before a reservation starts |
| `EXPIRY_REMINDER_MINUTES` | 15 | Notify this long before parking ends |

## Typical flow

1. Create slots: `POST /api/slots`
2. Register a vehicle: `POST /api/vehicles`
3. Get a recommended slot: `POST /api/slots/recommend`
4. Reserve it: `POST /api/reservations`
5. Arrive: `POST /api/parking/check-in`
6. Pay: `POST /api/payments/reservations/:reservationId`
7. Leave: `POST /api/overstays/:reservationId/checkout` (fines are frozen here)
8. Settle any fine: `POST /api/payments/fines/:fineId`

## API endpoints

User-scoped routes take a temporary `userId` (24-character ObjectId) until
authentication is added in Sprint 2 — see [deviation D-1](docs/DEVIATIONS.md).

### FR-1 Vehicles and slots

`POST /api/vehicles`

```json
{ "vehicleNumber": "KA01AB1234", "type": "CAR", "length": 4.5, "width": 1.8, "height": 1.5 }
```

`type` is one of `CAR`, `BIKE`, `SUV`, `VAN`, `TRUCK`.

`GET /api/vehicles/:vehicleNumber`

`POST /api/slots`

```json
{ "slotNumber": "A1", "length": 5, "width": 2.5, "height": 2.2 }
```

`GET /api/slots` (optional `?status=AVAILABLE` or `?status=OCCUPIED`)

`POST /api/slots/recommend` with `{ "vehicleNumber": "KA01AB1234" }` returns the
smallest available slot that fits the vehicle, or 404 with a clear message.

### FR-2 Reservations

`POST /api/reservations`

```json
{
  "userId": "000000000000000000000001",
  "vehicleId": "<vehicle _id>",
  "slotId": "<slot _id>",
  "startTime": "2027-01-10T10:00:00.000Z",
  "endTime": "2027-01-10T12:00:00.000Z"
}
```

The vehicle must fit the slot, the start must be in the future, and confirmed
reservations for the same slot may not overlap:

`existing.startTime < new.endTime` AND `existing.endTime > new.startTime`

`GET /api/reservations/my/:userId`

`DELETE /api/reservations/:id?userId=...` cancels before the start time.

### FR-3 Payments and transaction history

`POST /api/payments/reservations/:reservationId` with
`{ "userId": "...", "paymentMethod": "UPI" }` (`UPI`, `CARD`, `NET_BANKING`,
`WALLET`).

The amount is calculated by the server from the reservation duration; clients
cannot submit it. Successful payments are idempotent per reservation. Gateway
failures are recorded as `FAILED` transactions and notified to the user.

`POST /api/payments/fines/:fineId` settles a fine after checkout.

`GET /api/payments/my/:userId` lists transactions, newest first.

`DEMO_GATEWAY` only simulates payments. Replace `payment.gateway.js` with a
provider integration before taking real money.

### FR-4 Parking sessions and tracking

`POST /api/parking/check-in` with `{ "reservationId": "...", "userId": "..." }`
opens a parking session and marks the slot `OCCUPIED`.

`GET /api/parking/tracking/:vehicleNumber` returns the vehicle, its current
slot (if parked) and its completed sessions.

### FR-5 Overstay detection and fines

The server scans confirmed reservations whose `endTime` has passed every
`OVERSTAY_CHECK_INTERVAL_MS`; `POST /api/overstays/detect` runs it on demand.
One fine is kept per reservation, linked to its parking session, and an
overstay notification is sent when it is first detected.

`POST /api/overstays/:reservationId/checkout` with `{ "userId": "..." }`
completes the reservation, closes the parking session, frees the slot and
freezes any fine.

`GET /api/overstays/my/:userId` lists the user's fines.

### FR-6 Analytics

`GET /api/analytics` returns:

- `summary` — reservation counts by status
- `occupancy.current` — total, occupied and available slots and occupancy rate
- `occupancy.frequentlyUsedSlots` — reservations per slot
- `peakHours` — reservations by start hour
- `vehicleTypeBreakdown` — reservations by vehicle type
- `revenue` — total, parking and fine revenue, payment counts and daily totals

### FR-7 Notifications

Notifications are created automatically for: reservation confirmed, upcoming
reservation, parking about to expire, payment success/failure and overstay.

`GET /api/notifications/:userId`

`PATCH /api/notifications/:id/read?userId=...`

`POST /api/notifications` with `userId`, `type`, `title`, `message` and an
optional `relatedId`.

## Folder structure

```text
server.js                 # app setup, routes, overstay + reminder schedulers
src/modules/
  vehicle/                # FR-1 vehicle registration
  slot/                   # FR-1 slots and recommendation
  reservation/            # FR-2
  payment/                # FR-3 (calculations, gateway, service)
  parking/                # FR-4 sessions and tracking
  overstay/               # FR-5
  analytics/              # FR-6
  notification/           # FR-7 (service + reminder scheduler)
tests/                    # node:test unit tests, one file per FR
docs/                     # sprint report and deviations
```
