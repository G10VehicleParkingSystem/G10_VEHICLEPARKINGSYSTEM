# G10 Vehicle Parking System — Backend

Express + MongoDB backend implementing the eight functional requirements from
the G10 SRS:

- FR-1: Vehicle-Size-Based Smart Slot Allocation & Recommendation
- FR-2: Advanced Reservation & Cancellation
- FR-3: Digital Payment & Transaction History
- FR-4: Vehicle Tracking & Parking History
- FR-5: Overstay Detection & Fines
- FR-6: Admin Analytics & Reports
- FR-7: Notifications & Alerts
- FR-8: Monthly Reserved Parking Subscription

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
| `MONTHLY_SUBSCRIPTION_RATE` | 3000 | Monthly reserved parking subscription fee in INR |
| `OVERSTAY_CHECK_INTERVAL_MS` | 60000 | How often overstays and reminders are checked |
| `UPCOMING_REMINDER_MINUTES` | 30 | Notify this long before a reservation starts |
| `EXPIRY_REMINDER_MINUTES` | 15 | Notify this long before parking ends |

`MONTHLY_SUBSCRIPTION_RATE` is a configurable development default, not a
confirmed business price.

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

### FR-8 Monthly Reserved Parking Subscription

Users can subscribe to a specific parking slot for one calendar month by paying
the configured monthly subscription fee.

**Subscription endpoints**

`GET /api/subscriptions/plans`

Returns the available monthly subscription plan, including its duration, price
and currency.

`POST /api/subscriptions`

Creates a monthly subscription.

Example request:

```json
{
  "userId": "000000000000000000000001",
  "vehicleId": "<vehicle _id>",
  "slotId": "<slot _id>",
  "paymentMethod": "UPI"
}
```

Supported payment methods are `UPI`, `CARD`, `NET_BANKING` and `WALLET`.

`GET /api/subscriptions/my/:userId`

Returns the subscriptions belonging to the specified user.

`POST /api/subscriptions/:id/renew`

Manually renews an active subscription by submitting `userId` and
`paymentMethod` in the request body. Renewal is not automatic.

`PATCH /api/subscriptions/:id/cancel`

Schedules cancellation at the end of the current subscription period. The slot
remains protected until the subscription expires.

**Subscription parking endpoints**

`POST /api/parking/subscription/check-in`

Example request:

```json
{
  "subscriptionId": "<subscription _id>",
  "userId": "000000000000000000000001"
}
```

Checks the subscriber into their reserved slot and creates an active parking
session. The slot is marked `OCCUPIED` while the vehicle is physically parked.

`POST /api/parking/subscription/:subscriptionId/check-out`

Example request:

```json
{
  "userId": "000000000000000000000001"
}
```

Completes the parking session and releases the physical slot.

**Subscription lifecycle and slot protection**

- A successful initial payment activates the subscription for one calendar month.
- Pending payments temporarily lock the selected slot. Uncompleted payments expire after five minutes.
- Active subscriptions protect their slots from overlapping reservations and other subscriptions.
- A subscribed slot is not marked `OCCUPIED` merely because it is reserved. Its physical occupancy changes only through parking check-in and check-out.
- Users can repeatedly check in and check out during their active subscription period.
- Renewal is manual. No automatic payment is charged.
- When the subscription expires, the slot protection is released.
- Subscription expiry and abandoned pending payments are checked automatically by the server using `OVERSTAY_CHECK_INTERVAL_MS`.

As with the other user-scoped APIs, `userId` is temporarily supplied by the
client until authentication is implemented.

## Folder structure

```text
server.js                 # app setup, routes and background schedulers
src/modules/
  vehicle/                # FR-1 vehicle registration
  slot/                   # FR-1 slots and recommendation
  reservation/            # FR-2
  payment/                # FR-3 (calculations, gateway, service)
  parking/                # FR-4 sessions, tracking and FR-8 subscription parking
  subscription/           # FR-8 monthly reserved parking
  overstay/               # FR-5
  analytics/              # FR-6
  notification/           # FR-7 (service + reminder scheduler)
tests/                    # node:test unit tests, one file per FR
docs/                     # sprint report and deviations
```
