import { useState } from "react";
import { Link } from "react-router-dom";
import { get, patch, post } from "../api.js";
import { useSession } from "../session.jsx";
import {
  Empty, LoadError, Plate, StatusTag, formatDay, rupees, useAction, useLoad, zoneName, zoneOf
} from "../ui.jsx";
import { PAYMENT_METHODS } from "./Bookings.jsx";

const fits = (vehicle, slot) =>
  slot.length >= vehicle.length && slot.width >= vehicle.width && slot.height >= vehicle.height;

async function loadPasses(userId, vehicles) {
  const [plan, passes, slots, parked] = await Promise.all([
    get("/subscriptions/plans").then((d) => d.plan),
    get(`/subscriptions/my/${userId}`).then((d) => d.subscriptions),
    get("/slots").then((d) => d.slots),
    Promise.all(
      vehicles.map((v) =>
        get(`/parking/tracking/${encodeURIComponent(v.vehicleNumber)}`)
          .then((d) => d.currentSlot && { vehicleId: d.vehicle._id, slotId: d.currentSlot._id })
          .catch(() => null)
      )
    )
  ]);
  return { plan, passes, slots, parked: parked.filter(Boolean) };
}

function BuyPass({ plan, slots, onBought }) {
  const { profile, vehicles } = useSession();
  const { busy, run } = useAction();
  const [vehicleNumber, setVehicleNumber] = useState("");
  const [slotId, setSlotId] = useState("");
  const [method, setMethod] = useState("UPI");

  const vehicle = vehicles.find((v) => v.vehicleNumber === vehicleNumber) || vehicles[0];
  const options = vehicle
    ? slots.filter((s) => s.status === "AVAILABLE" && fits(vehicle, s)).sort((a, b) => a.slotNumber.localeCompare(b.slotNumber))
    : [];
  const chosenSlot = options.find((s) => s._id === slotId) || options[0];

  if (!vehicle) {
    return (
      <Empty title="Add your vehicle first">
        A pass is tied to one vehicle. <Link to="/">Add it on Find a spot</Link>.
      </Empty>
    );
  }

  async function buy(event) {
    event.preventDefault();
    const ok = await run(
      "buy",
      () => post("/subscriptions", { userId: profile.id, vehicleId: vehicle._id, slotId: chosenSlot._id, paymentMethod: method }),
      (d) => `Pass active until ${formatDay(d.subscription.endDate)}. ${chosenSlot.slotNumber} is yours.`
    );
    if (ok) onBought();
  }

  return (
    <form className="form" onSubmit={buy}>
      <div className="row">
        <div className="field">
          <label htmlFor="pass-vehicle">Vehicle</label>
          <select id="pass-vehicle" value={vehicle.vehicleNumber} onChange={(e) => setVehicleNumber(e.target.value)}>
            {vehicles.map((v) => <option key={v.vehicleNumber} value={v.vehicleNumber}>{v.vehicleNumber}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="pass-slot">Your slot</label>
          <select id="pass-slot" value={chosenSlot?._id || ""} onChange={(e) => setSlotId(e.target.value)}
            disabled={!options.length}>
            {options.length === 0 && <option>No free slot fits</option>}
            {options.map((s) => (
              <option key={s._id} value={s._id}>{s.slotNumber} · {zoneName(zoneOf(s.slotNumber))}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="field">
        <span className="label">Pay with</span>
        <div className="choice-row">
          {PAYMENT_METHODS.map(([value, label]) => (
            <button key={value} type="button" className="choice" aria-pressed={method === value}
              onClick={() => setMethod(value)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="actions">
        <button className="btn btn-primary" disabled={!chosenSlot || busy === "buy"}>
          {busy === "buy" ? "Paying…" : `Pay ${rupees(plan.amount)} and get the pass`}
        </button>
      </div>
    </form>
  );
}

function PassCard({ pass, slot, vehicle, isParked, reload }) {
  const { profile } = useSession();
  const { busy, run } = useAction();
  const active = pass.status === "ACTIVE";

  const act = async (key, fn, message) => {
    const ok = await run(key, fn, message);
    if (ok) reload();
  };

  return (
    <div className="ticket pass">
      <div className="ticket-stub">
        <span className="ticket-label">Monthly pass</span>
        <span className="ticket-slot">{slot?.slotNumber || "?"}</span>
        <span className="ticket-zone">{slot ? zoneName(zoneOf(slot.slotNumber)) : ""}</span>
      </div>
      <div className="ticket-body">
        <div className="ticket-line">
          {vehicle ? <Plate number={vehicle.vehicleNumber} /> : null}
          {isParked ? <span className="tag orange">Parked now</span> : <StatusTag status={pass.status} />}
          {pass.cancelAtPeriodEnd && <span className="tag grey">Won't renew</span>}
        </div>
        <div className="ticket-when">
          {formatDay(pass.startDate)} to {formatDay(pass.endDate)}
        </div>
        <p className="muted small">{rupees(pass.monthlyAmount)} a month · park any time, no booking needed</p>

        {active && (
          <div className="actions" style={{ marginTop: 8 }}>
            {isParked ? (
              <button type="button" className="btn btn-outline btn-sm" disabled={busy === "out"}
                onClick={() => act("out", () => post(`/parking/subscription/${pass._id}/check-out`, { userId: profile.id }),
                  "Checked out. Your slot stays reserved for you.")}>
                I'm leaving
              </button>
            ) : (
              <button type="button" className="btn btn-navy btn-sm" disabled={busy === "in"}
                onClick={() => act("in", () => post("/parking/subscription/check-in", { subscriptionId: pass._id, userId: profile.id }),
                  `Checked in at ${slot?.slotNumber}.`)}>
                I've arrived
              </button>
            )}
            {!pass.cancelAtPeriodEnd && (
              <>
                <button type="button" className="btn btn-primary btn-sm" disabled={busy === "renew"}
                  onClick={() => act("renew", () => post(`/subscriptions/${pass._id}/renew`, { userId: profile.id, paymentMethod: "UPI" }),
                    "Renewed for another month (paid by UPI).")}>
                  Renew a month
                </button>
                <button type="button" className="btn btn-danger btn-sm" disabled={busy === "cancel"}
                  onClick={() => act("cancel", () => patch(`/subscriptions/${pass._id}/cancel`, { userId: profile.id }),
                    `Your pass won't renew. You keep the slot until ${formatDay(pass.endDate)}.`)}>
                  Don't renew
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function MonthlyPass() {
  const { profile, vehicles } = useSession();
  const { data, error, reload } = useLoad(() => loadPasses(profile.id, vehicles), [profile.id, vehicles.length]);
  const slotById = Object.fromEntries((data?.slots || []).map((s) => [s._id, s]));
  const vehicleById = Object.fromEntries(vehicles.map((v) => [v._id, v]));

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1>Monthly pass</h1>
          <p>Coming in every day for classes? Get a slot that's only yours for the month. Just turn up and park,
            no booking each time.</p>
        </div>
      </div>

      {error && <LoadError error={error} onRetry={reload} />}
      {!data && !error && <p className="muted small">Loading…</p>}

      {data && (
        <div className="cols">
          <section className="panel plan">
            <div className="plan-price">
              {rupees(data.plan.amount)}
              <small> / month</small>
            </div>
            <h2 style={{ marginBottom: 4 }}>{data.plan.name}</h2>
            <ul className="plan-points">
              <li>One slot kept for you, every day of the month</li>
              <li>Check in and out as often as you like</li>
              <li>Renew in one tap, or let it end</li>
            </ul>
            <BuyPass plan={data.plan} slots={data.slots} onBought={reload} />
          </section>

          <section className="stack">
            <div className="panel-head" style={{ margin: 0 }}>
              <h2>My passes</h2>
            </div>
            {data.passes.length === 0 ? (
              <div className="panel"><Empty title="No pass yet">Pick a slot on the left to get one.</Empty></div>
            ) : (
              data.passes.map((pass) => (
                <PassCard
                  key={pass._id}
                  pass={pass}
                  slot={slotById[pass.slotId]}
                  vehicle={vehicleById[pass.vehicleId]}
                  isParked={data.parked.some((p) => p.vehicleId === pass.vehicleId && p.slotId === pass.slotId)}
                  reload={reload}
                />
              ))
            )}
          </section>
        </div>
      )}
    </main>
  );
}
