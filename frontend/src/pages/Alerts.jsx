import { get, patch } from "../api.js";
import { useSession } from "../session.jsx";
import { Empty, LoadError, formatDateTime, useAction, useLoad } from "../ui.jsx";

const KIND = {
  RESERVATION_CONFIRMED: "Booking",
  RESERVATION_UPCOMING: "Reminder",
  PARKING_EXPIRING: "Reminder",
  PAYMENT_SUCCESS: "Payment",
  PAYMENT_FAILED: "Payment",
  OVERSTAY: "Fine",
  FINE: "Fine"
};

export const loadAlerts = (userId) => get(`/notifications/${userId}`).then((d) => d.notifications);

// Tells the top bar to refresh its unread count.
const announce = () => window.dispatchEvent(new Event("campuspark:alerts"));

export default function Alerts() {
  const { profile } = useSession();
  const { busy, run } = useAction();
  const { data, error, reload } = useLoad(() => loadAlerts(profile.id), [profile.id]);

  async function markRead(id) {
    const ok = await run(id, () => patch(`/notifications/${id}/read?userId=${profile.id}`));
    if (ok) {
      reload();
      announce();
    }
  }

  async function markAll() {
    const unread = data.filter((n) => !n.isRead);
    await run("all", () => Promise.all(unread.map((n) => patch(`/notifications/${n._id}/read?userId=${profile.id}`))));
    reload();
    announce();
  }

  const unreadCount = data?.filter((n) => !n.isRead).length || 0;

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1>Alerts</h1>
          <p>Booking confirmations, a reminder before your slot starts and before your time runs out, payment
            receipts and overstay warnings.</p>
        </div>
        {unreadCount > 0 && (
          <button type="button" className="btn btn-outline" onClick={markAll} disabled={busy === "all"}>
            Mark all as read
          </button>
        )}
      </div>

      {error && <LoadError error={error} onRetry={reload} />}
      {!data && !error && <p className="muted small">Loading…</p>}

      {data && (
        <section className="panel">
          {data.length === 0 ? (
            <Empty title="No alerts yet">They'll show up here when you book, pay or park.</Empty>
          ) : (
            <div className="list">
              {data.map((n) => (
                <div key={n._id} className={`list-item alert ${n.isRead ? "" : "unread"}`}>
                  <div className="alert-text">
                    <div className="actions">
                      <span className={`tag ${["OVERSTAY", "FINE", "PAYMENT_FAILED"].includes(n.type) ? "warn" : ""}`}>
                        {KIND[n.type] || "Update"}
                      </span>
                      <strong>{n.title}</strong>
                    </div>
                    <p>{n.message}</p>
                    <span className="muted small">{formatDateTime(n.createdAt)}</span>
                  </div>
                  {!n.isRead && (
                    <button type="button" className="btn-link small" onClick={() => markRead(n._id)} disabled={busy === n._id}>
                      Mark as read
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </main>
  );
}
