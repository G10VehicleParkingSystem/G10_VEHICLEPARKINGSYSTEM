import { useState } from "react";
import { post } from "../api.js";
import { useSession } from "../session.jsx";
import { useAction } from "../ui.jsx";

export function Stars({ value }) {
  const rounded = Math.round(value);
  return (
    <span className="stars" aria-label={`${value} out of 5`}>
      {"★★★★★".slice(0, rounded)}
      <span className="stars-off">{"★★★★★".slice(rounded)}</span>
    </span>
  );
}

// Shown on a finished booking: 1 to 5 stars and an optional comment.
export function RateSlot({ reservationId, onDone }) {
  const { profile } = useSession();
  const { busy, run } = useAction();
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [text, setText] = useState("");

  if (!open) {
    return (
      <button type="button" className="btn btn-outline btn-sm" onClick={() => setOpen(true)}>
        Rate this spot
      </button>
    );
  }

  async function submit(event) {
    event.preventDefault();
    const ok = await run(
      "rate",
      () => post("/reviews", { userId: profile.id, reservationId, rating, review: text.trim() }),
      "Thanks! Your rating helps other students pick a spot."
    );
    if (ok) onDone();
  }

  return (
    <form className="rate-form" onSubmit={submit}>
      <div className="star-picker" role="radiogroup" aria-label="Rating">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" role="radio" aria-checked={rating === n}
            className={n <= rating ? "on" : ""} onClick={() => setRating(n)} aria-label={`${n} star${n > 1 ? "s" : ""}`}>
            ★
          </button>
        ))}
      </div>
      <textarea rows={2} maxLength={500} placeholder="Anything others should know? (shade, near which block, tight turn…)"
        value={text} onChange={(e) => setText(e.target.value)} />
      <div className="actions">
        <button className="btn btn-primary btn-sm" disabled={!rating || busy === "rate"}>
          {busy === "rate" ? "Sending…" : "Submit rating"}
        </button>
        <button type="button" className="btn-link small" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </form>
  );
}
