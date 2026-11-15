import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { get, post } from "../api.js";
import { useSession } from "../session.jsx";
import {
  Empty, LoadError, Plate, VEHICLE_TYPES, formatDay, formatTime, useAction, useLoad, zoneName, zoneOf
} from "../ui.jsx";
import VehicleQr from "../components/VehicleQr.jsx";
import { Stars } from "../components/Rating.jsx";

// Free slots right now, grouped by zone (the letters at the start of a slot number).
export function AvailabilityBoard({ slots }) {
  if (!slots.length) {
    return (
      <Empty title="No parking slots yet">
        The parking office hasn't added any slots.
      </Empty>
    );
  }

  const zones = new Map();
  for (const slot of slots) {
    const zone = zones.get(zoneOf(slot.slotNumber)) || { total: 0, free: 0 };
    zone.total += 1;
    if (slot.status === "AVAILABLE") zone.free += 1;
    zones.set(zoneOf(slot.slotNumber), zone);
  }

  return (
    <div className="zones">
      {[...zones.entries()].sort().map(([name, zone]) => (
        <div className="zone" key={name}>
          <div className="zone-name">{zoneName(name)}</div>
          <div className="zone-free">
            {zone.free} <small>of {zone.total} free</small>
          </div>
          <div className="meter" aria-hidden="true">
            <span style={{ width: `${((zone.total - zone.free) / zone.total) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------- My vehicles ---------- */

function AddVehicle({ onAdded }) {
  const { rememberVehicle } = useSession();
  const { busy, run } = useAction();
  const [number, setNumber] = useState("");
  const [type, setType] = useState("BIKE");
  const [size, setSize] = useState(VEHICLE_TYPES.BIKE.size);

  function pickType(next) {
    setType(next);
    setSize(VEHICLE_TYPES[next].size);
  }

  async function submit(event) {
    event.preventDefault();
    const vehicleNumber = number.replace(/\s+/g, "").toUpperCase();
    const vehicle = await run("add", async () => {
      try {
        const data = await post("/vehicles", { vehicleNumber, type, ...size });
        return data.vehicle;
      } catch (error) {
        // Registered before (for example on another laptop): just add it to this list.
        if (/already registered/i.test(error.message)) {
          return (await get(`/vehicles/${encodeURIComponent(vehicleNumber)}`)).vehicle;
        }
        throw error;
      }
    }, (v) => `${v.vehicleNumber} added to your vehicles.`);

    if (vehicle) {
      rememberVehicle(vehicle);
      setNumber("");
      onAdded?.(vehicle);
    }
  }

  return (
    <form className="form" onSubmit={submit}>
      <div className="field">
        <label htmlFor="plate">Vehicle number</label>
        <input
          id="plate"
          className="plate-input"
          placeholder="KA 05 MX 2231"
          value={number}
          onChange={(e) => setNumber(e.target.value)}
          required
        />
      </div>

      <div className="field">
        <span className="label">Type</span>
        <div className="choice-row">
          {Object.entries(VEHICLE_TYPES).map(([key, info]) => (
            <button
              key={key}
              type="button"
              className="choice"
              aria-pressed={type === key}
              onClick={() => pickType(key)}
            >
              {info.label}
            </button>
          ))}
        </div>
      </div>

      <details className="more">
        <summary>Exact size (optional)</summary>
        <div className="row">
          {["length", "width", "height"].map((dim) => (
            <div className="field" key={dim}>
              <label htmlFor={`dim-${dim}`}>{dim[0].toUpperCase() + dim.slice(1)} (m)</label>
              <input
                id={`dim-${dim}`}
                type="number"
                step="0.1"
                min="0.1"
                value={size[dim]}
                onChange={(e) => setSize({ ...size, [dim]: Number(e.target.value) })}
              />
            </div>
          ))}
        </div>
        <p className="help small muted" style={{ marginTop: 6 }}>
          We fill in a typical size for the type. Change it if yours is bigger, so we never suggest a slot it
          won't fit in.
        </p>
      </details>

      <div>
        <button className="btn btn-navy" disabled={busy === "add"}>
          {busy === "add" ? "Adding…" : "Add vehicle"}
        </button>
      </div>
    </form>
  );
}

function MyVehicles() {
  const { vehicles, forgetVehicle } = useSession();
  const [qrFor, setQrFor] = useState(null);

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>My vehicles</h2>
        <span className="hint">{vehicles.length ? `${vehicles.length} saved` : ""}</span>
      </div>

      {vehicles.length > 0 && (
        <div className="list" style={{ marginBottom: 18 }}>
          {vehicles.map((v) => (
            <div className="list-item" key={v.vehicleNumber}>
              <div className="actions">
                <Plate number={v.vehicleNumber} />
                <span className="muted small">{VEHICLE_TYPES[v.type]?.label || v.type}</span>
              </div>
              <div className="actions">
                <button type="button" className="btn btn-outline btn-sm" onClick={() => setQrFor(v.vehicleNumber)}>
                  Gate pass
                </button>
                <button type="button" className="btn-link small" onClick={() => forgetVehicle(v.vehicleNumber)}>
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <AddVehicle />
      {qrFor && <VehicleQr vehicleNumber={qrFor} onClose={() => setQrFor(null)} />}
    </section>
  );
}

/* ---------- Book a spot ---------- */

function toLocalDate(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function toLocalTime(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// Next half hour that is at least 15 minutes away.
function defaultStart() {
  const d = new Date(Date.now() + 15 * 60000);
  d.setSeconds(0, 0);
  d.setMinutes(d.getMinutes() <= 30 ? 30 : 60);
  return d;
}

function BookSpot({ onBooked }) {
  const { profile, vehicles } = useSession();
  const { busy, run } = useAction();
  const start = useMemo(defaultStart, []);
  const [vehicleNumber, setVehicleNumber] = useState("");
  const [date, setDate] = useState(toLocalDate(start));
  const [from, setFrom] = useState(toLocalTime(start));
  const [until, setUntil] = useState(toLocalTime(new Date(start.getTime() + 2 * 3600000)));
  const [suggestion, setSuggestion] = useState(null);

  const chosen = vehicles.find((v) => v.vehicleNumber === vehicleNumber) || vehicles[0];
  const startAt = new Date(`${date}T${from}`);
  const endAt = new Date(`${date}T${until}`);
  const hours = Math.ceil((endAt - startAt) / 3600000);

  async function findSpot(event) {
    event.preventDefault();
    if (!(endAt > startAt)) {
      setSuggestion({ error: "The end time has to be after the start time." });
      return;
    }
    const data = await run("find", () => post("/slots/recommend", { vehicleNumber: chosen.vehicleNumber }));
    if (!data) return setSuggestion(null);
    // Ratings are a nice extra: a failure here shouldn't block booking.
    const rating = await get(`/reviews/slot/${data.slot._id}`).then((d) => d.rating).catch(() => null);
    setSuggestion({ slot: data.slot, rating });
  }

  async function book() {
    const data = await run(
      "book",
      () =>
        post("/reservations", {
          userId: profile.id,
          vehicleId: chosen._id,
          slotId: suggestion.slot._id,
          startTime: startAt.toISOString(),
          endTime: endAt.toISOString()
        }),
      `Booked ${suggestion.slot.slotNumber} for ${formatDay(startAt)}, ${formatTime(startAt)}.`
    );
    if (data) {
      setSuggestion(null);
      onBooked?.(data.reservation);
    }
  }

  if (!vehicles.length) {
    return (
      <section className="panel">
        <div className="panel-head">
          <h2>Book a spot</h2>
        </div>
        <Empty title="Add your vehicle first">
          We need its type to find a slot it fits in. Use “My vehicles” on this page.
        </Empty>
      </section>
    );
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Book a spot</h2>
        <span className="hint">₹50 an hour, paid after you arrive</span>
      </div>

      <form className="form" onSubmit={findSpot}>
        <div className="field">
          <label htmlFor="vehicle">Vehicle</label>
          <select
            id="vehicle"
            value={chosen.vehicleNumber}
            onChange={(e) => {
              setVehicleNumber(e.target.value);
              setSuggestion(null);
            }}
          >
            {vehicles.map((v) => (
              <option key={v.vehicleNumber} value={v.vehicleNumber}>
                {v.vehicleNumber} ({VEHICLE_TYPES[v.type]?.label || v.type})
              </option>
            ))}
          </select>
        </div>

        <div className="row">
          <div className="field">
            <label htmlFor="date">Date</label>
            <input id="date" type="date" value={date} min={toLocalDate(new Date())}
              onChange={(e) => { setDate(e.target.value); setSuggestion(null); }} required />
          </div>
          <div className="field">
            <label htmlFor="from">From</label>
            <input id="from" type="time" step="900" value={from}
              onChange={(e) => { setFrom(e.target.value); setSuggestion(null); }} required />
          </div>
          <div className="field">
            <label htmlFor="until">Until</label>
            <input id="until" type="time" step="900" value={until}
              onChange={(e) => { setUntil(e.target.value); setSuggestion(null); }} required />
          </div>
        </div>

        <div className="actions">
          <button className="btn btn-primary" disabled={busy === "find"}>
            {busy === "find" ? "Looking…" : "Find me a spot"}
          </button>
          {hours > 0 && (
            <span className="muted small">
              {hours} {hours === 1 ? "hour" : "hours"} · about ₹{hours * 50}
            </span>
          )}
        </div>
      </form>

      {suggestion?.error && <div className="notice warn" style={{ marginTop: 16 }}>{suggestion.error}</div>}

      {suggestion?.slot && (
        <div className="ticket" style={{ marginTop: 18 }}>
          <div className="ticket-stub">
            <span className="ticket-label">Slot</span>
            <span className="ticket-slot">{suggestion.slot.slotNumber}</span>
            <span className="ticket-zone">{zoneName(zoneOf(suggestion.slot.slotNumber))}</span>
          </div>
          <div className="ticket-body">
            <div className="ticket-line">
              <Plate number={chosen.vehicleNumber} />
              {suggestion.rating?.totalReviews > 0 && (
                <span className="small muted">
                  <Stars value={suggestion.rating.averageRating} /> {suggestion.rating.averageRating.toFixed(1)}
                  {" "}({suggestion.rating.totalReviews})
                </span>
              )}
            </div>
            <div className="ticket-when">
              {formatDay(startAt)} · {formatTime(startAt)} to {formatTime(endAt)}
            </div>
            <p className="muted small">
              Smallest free slot your {VEHICLE_TYPES[chosen.type]?.label.toLowerCase() || "vehicle"} fits in
              ({suggestion.slot.length} × {suggestion.slot.width} m).
            </p>
            <div className="actions" style={{ marginTop: 12 }}>
              <button type="button" className="btn btn-primary" onClick={book} disabled={busy === "book"}>
                {busy === "book" ? "Booking…" : `Book ${suggestion.slot.slotNumber}`}
              </button>
              <button type="button" className="btn-link small" onClick={() => setSuggestion(null)}>
                Change time
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export default function FindSpot() {
  const navigate = useNavigate();
  const slots = useLoad(() => get("/slots").then((d) => d.slots), []);

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1>Find a spot</h1>
          <p>Book a slot before you head to campus. We pick the smallest free slot your vehicle fits in, so big
            slots stay free for cars and buses.</p>
        </div>
      </div>

      <div className="cols">
        <div className="stack">
          <MyVehicles />
        </div>
        <div className="stack">
          <BookSpot onBooked={() => navigate("/bookings")} />
          <section className="panel">
            <div className="panel-head">
              <h2>Free right now</h2>
              <span className="hint">Bar shows how full each area is</span>
            </div>
            {slots.error && <LoadError error={slots.error} onRetry={slots.reload} />}
            {slots.data && <AvailabilityBoard slots={slots.data} />}
          </section>
        </div>
      </div>
    </main>
  );
}
