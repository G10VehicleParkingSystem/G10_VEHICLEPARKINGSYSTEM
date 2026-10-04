# G10 Vehicle Parking System — FR-2 + FR-7

This package contains only the isolated backend modules for:

- FR-2: Advanced Reservation & Cancellation
- FR-7: Notifications & Alerts

The modules are deliberately separated so teammates implementing FR-1, FR-3, FR-4, FR-5 and FR-6 can work independently.

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
