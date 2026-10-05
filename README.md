# G10 Vehicle Parking System — FR-2 + FR-3 + FR-5 + FR-7

This package contains only the isolated backend modules for:

- FR-2: Advanced Reservation & Cancellation
- FR-3: Digital Payment & Transaction History
- FR-5: Overstay Detection & Fines
- FR-7: Notifications & Alerts

The modules are deliberately separated so teammates implementing FR-1, FR-4 and FR-6 can work independently.

## Requirements

- Node.js 18+
- MongoDB running locally
- npm

## Run

```bash
npm install
copy .env.example .env
npm start
```

Linux/macOS:

```bash
cp .env.example .env
npm install
npm start
```

Server:
http://localhost:5000

Health check:
GET http://localhost:5000/api/health

Run billing tests:

```bash
npm test
```

## API endpoints

### FR-2 Reservation

POST `/api/reservations`

Body:
```json
{
  "userId": "000000000000000000000001",
  "vehicleId": "000000000000000000000002",
  "slotId": "000000000000000000000003",
  "startTime": "2027-01-10T10:00:00.000Z",
  "endTime": "2027-01-10T12:00:00.000Z"
}
```

GET `/api/reservations/my/:userId`

DELETE `/api/reservations/:reservationId?userId=000000000000000000000001`

### FR-7 Notifications

GET `/api/notifications/:userId`

PATCH `/api/notifications/:notificationId/read?userId=000000000000000000000001`

POST `/api/notifications`

Example body:
```json
{
  "userId": "000000000000000000000001",
  "type": "RESERVATION_CONFIRMED",
  "title": "Reservation Confirmed",
  "message": "Your parking slot reservation has been confirmed."
}
```

### FR-3 Digital payments and transaction history

POST `/api/payments/reservations/:reservationId`

Body:
```json
{
  "userId": "000000000000000000000001",
  "paymentMethod": "UPI"
}
```

The server calculates the amount from the reservation duration and
`HOURLY_PARKING_RATE` (INR per started hour); clients cannot submit an amount.
Successful payment requests are idempotent per reservation.

POST `/api/payments/fines/:fineId` accepts the same body and settles a fine
after checkout. GET `/api/payments/my/:userId` returns that user's transactions
in reverse chronological order.

The included `DEMO_GATEWAY` records simulated successes only. Set
`PAYMENT_GATEWAY=demo` for local testing; real digital payments require
replacing `payment.gateway.js` with a provider integration and verified
webhooks. Do not treat demo transactions as real charges.

### FR-5 Overstay detection and fines

POST `/api/overstays/detect` scans confirmed reservations whose `endTime` has
passed. The server also performs this scan every
`OVERSTAY_CHECK_INTERVAL_MS` (default 60000 ms). A unique fine is maintained per
reservation and recalculated at `FINE_PER_HOUR` (INR per started overstay hour,
default 100); an overstay notification is created when first detected.

POST `/api/overstays/:reservationId/checkout` with `{ "userId": "..." }`
completes the reservation and freezes any accrued fine. GET
`/api/overstays/my/:userId` lists the user's fines. Unpaid fines can then be
settled through the FR-3 fine payment endpoint.

These routes follow the temporary `userId` request convention used by FR-2 and
FR-7. Add authentication and admin authorization to the detection endpoint
before deploying this isolated backend publicly.

## Important integration note

For the team repository, the existing project's authentication middleware should eventually replace the temporary `userId` request parameters/body fields. The reservation and notification business logic itself is isolated in `src/modules/reservation` and `src/modules/notification`.

The reservation service checks the overlap condition:

`existing.startTime < new.endTime` AND `existing.endTime > new.startTime`

This prevents overlapping confirmed reservations for the same slot.

## Folder structure

```text
src/
  modules/
    reservation/
      reservation.model.js
      reservation.service.js
      reservation.controller.js
      reservation.routes.js
    notification/
      notification.model.js
      notification.service.js
      notification.controller.js
      notification.routes.js
server.js
```
