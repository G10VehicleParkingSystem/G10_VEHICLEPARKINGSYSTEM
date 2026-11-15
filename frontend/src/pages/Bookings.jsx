import { useState } from "react";
import { Link } from "react-router-dom";
import { del, get, post } from "../api.js";
import { useSession } from "../session.jsx";
import {
  Empty, LoadError, Plate, StatusTag, formatDay, formatTime, rupees, useAction, useLoad, zoneName, zoneOf
} from "../ui.jsx";

export const PAYMENT_METHODS = [
  ["UPI", "UPI"],
  ["CARD", "Card"],
  ["NET_BANKING", "Net banking"],
  ["WALLET", "Wallet"]
];

const TABS = [
  ["upcoming", "Upcoming & parked"],
  ["past", "Past"],
  ["cancelled", "Cancelled"]
];

// Everything the bookings screen needs, loaded together.
async function loadBookings(userId, vehicles) {
  const [reservations, slots, payments, parked] = await Promise.all([
    get(`/reservations/my/${userId}`).then((d) => d.reservations),
    get("/slots").then((d) => d.slots),
    get(`/payments/my/${userId}`).then((d) => d.transactions),
    // A vehicle whose current slot matches a confirmed booking is parked there now.
    Promise.all(
      vehicles.map((v) =>
        get(`/parking/tracking/${encodeURIComponent(v.vehicleNumber)}`)
          .then((d) => d.currentSlot && { vehicleId: d.vehicle._id, slotId: d.currentSlot._id })
          .catch(() => null)
      )
    )
  ]);

  return {
    reservations,
    slotById: Object.fromEntries(slots.map((s) => [s._id, s])),
    paidByReservation: Object.fromEntries(
      payments.filter((p) => p.reservationId && p.status === "SUCCESS").map((p) => [p.reservationId, p])
    ),
    parked: parked.filter(Boolean)
  };
}

function PayChooser({ amount, busy, onPay, onCancel }) {
  const [method, setMethod] = useState("UPI");
  return (
    <div className="pay-chooser">
      <span className="label">Pay about {rupees(amount)} with</span>
      <div className="choice-row">
        {PAYMENT_METHODS.map(([value, label]) => (
          <button key={value} type="button" className="choice" aria-pressed={method === value}
            onClick={() => setMethod(value)}>
            {label}
          </button>
        ))}
      </div>
      <div className="actions">
        <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => onPay(method)}>
          {busy ? "Paying…" : "Pay now"}
        </button>
        <button type="button" className="btn-link small" onClick={onCancel}>Not now</button>
      </div>
    </div>
  );
}

function BookingTicket({ booking, slot, vehicle, payment, isParked, reload }) {
  const { profile } = useSession();
  const { busy, run } = useAction();
  const [paying, setPaying] = useState(false);

  const start = new Date(booking.startTime);
  const end = new Date(booking.endTime);
  const hours = Math.ceil((end - start) / 3600000);
  const started = Date.now() >= start.getTime();
  const confirmed = booking.status === "CONFIRMED";

  const act = async (key, fn, message) => {
    const ok = await run(key, fn, message);
    if (ok) reload();
  };

  return (
    <div className="ticket">
      <div className="ticket-stub">
        <span className="ticket-label">Slot</span>
        <span className="ticket-slot">{slot?.slotNumber || "?"}</span>
        <span className="ticket-zone">{slot ? zoneName(zoneOf(slot.slotNumber)) : ""}</span>
      </div>
      <div className="ticket-body">
        <div className="ticket-line">
          {vehicle ? <Plate number={vehicle.vehicleNumber} /> : <span className="muted small">Vehicle</span>}
          {isParked ? <span className="tag orange">Parked now</span> : <StatusTag status={booking.status} />}
          {payment && <span className="tag ok">Paid {rupees(payment.amount)}</span>}
        </div>
        <div className="ticket-when">
          {formatDay(start)} · {formatTime(start)} to {formatTime(end)}
        </div>

        {confirmed && !paying && (
          <div className="actions" style={{ marginTop: 8 }}>
            {!isParked && (
              <button type="button" className="btn btn-navy btn-sm" disabled={busy === "in"}
                onClick={() => act("in", () => post("/parking/check-in", { reservationId: booking._id, userId: profile.id }),
                  `Checked in at ${slot?.slotNumber}. Have a good day!`)}>
                {busy === "in" ? "Checking in…" : "I've arrived"}
              </button>
            )}
            {!payment && (
              <button type="button" className="btn btn-primary btn-sm" onClick={() => setPaying(true)}>
                Pay {rupees(hours * 50)}
              </button>
            )}
            {isParked && (
              <button type="button" className="btn btn-outline btn-sm" disabled={busy === "out"}
                onClick={() => act("out", () => post(`/overstays/${booking._id}/checkout`, { userId: profile.id }),
                  (d) => (d.fine ? `You're checked out. Overstay fine: ${rupees(d.fine.fineAmount)}.` : "You're checked out. See you!"))}>
                {busy === "out" ? "Checking out…" : "I'm leaving"}
              </button>
            )}
            {!started && !isParked && (
              <button type="button" className="btn btn-danger btn-sm" disabled={busy === "cancel"}
                onClick={() => act("cancel", () => del(`/reservations/${booking._id}?userId=${profile.id}`),
                  "Booking cancelled. The slot is free for someone else.")}>
                Cancel
              </button>
            )}
          </div>
        )}

        {confirmed && paying && (
          <PayChooser
            amount={hours * 50}
            busy={busy === "pay"}
            onCancel={() => setPaying(false)}
            onPay={(method) =>
              act("pay", () => post(`/payments/reservations/${booking._id}`, { userId: profile.id, paymentMethod: method }),
                (d) => `Paid ${rupees(d.payment.amount)}. Receipt saved under Fines & payments.`)
            }
          />
        )}
      </div>
    </div>
  );
}

export default function Bookings() {
  const { profile, vehicles } = useSession();
  const [tab, setTab] = useState("upcoming");
  const { data, error, reload } = useLoad(() => loadBookings(profile.id, vehicles), [profile.id, vehicles.length]);

  const vehicleById = Object.fromEntries(vehicles.map((v) => [v._id, v]));
  const groups = { upcoming: [], past: [], cancelled: [] };
  for (const r of data?.reservations || []) {
    if (r.status === "CONFIRMED") groups.upcoming.push(r);
    else if (r.status === "COMPLETED") groups.past.push(r);
    else groups.cancelled.push(r);
  }
  groups.past.reverse();
  groups.cancelled.reverse();

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1>My bookings</h1>
          <p>Tap “I've arrived” when you park and “I'm leaving” on your way out. Stay past your booking and an
            overstay fine of ₹100 an hour is added.</p>
        </div>
        <Link to="/" className="btn btn-primary">Book another spot</Link>
      </div>

      <div className="tabs" role="tablist">
        {TABS.map(([key, label]) => (
          <button key={key} role="tab" type="button" aria-selected={tab === key} onClick={() => setTab(key)}>
            {label}
            <span className="tab-count">{groups[key].length}</span>
          </button>
        ))}
      </div>

      {error && <LoadError error={error} onRetry={reload} />}
      {!data && !error && <p className="muted small">Loading your bookings…</p>}

      {data && groups[tab].length === 0 && (
        <section className="panel">
          <Empty title={tab === "upcoming" ? "Nothing booked yet" : "Nothing here"}>
            {tab === "upcoming" && <>Got class tomorrow? <Link to="/">Book a spot</Link> the night before.</>}
          </Empty>
        </section>
      )}

      {data && groups[tab].length > 0 && (
        <div className="ticket-list">
          {groups[tab].map((booking) => (
            <BookingTicket
              key={booking._id}
              booking={booking}
              slot={data.slotById[booking.slotId]}
              vehicle={vehicleById[booking.vehicleId]}
              payment={data.paidByReservation[booking._id]}
              isParked={data.parked.some((p) => p.vehicleId === booking.vehicleId && p.slotId === booking.slotId)}
              reload={reload}
            />
          ))}
        </div>
      )}
    </main>
  );
}
