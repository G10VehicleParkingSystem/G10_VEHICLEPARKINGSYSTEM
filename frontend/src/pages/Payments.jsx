import { useState } from "react";
import { get, post } from "../api.js";
import { useSession } from "../session.jsx";
import { Empty, LoadError, StatusTag, formatDateTime, rupees, useAction, useLoad } from "../ui.jsx";
import { PAYMENT_METHODS } from "./Bookings.jsx";

const METHOD_LABEL = Object.fromEntries(PAYMENT_METHODS);

function paidFor(payment) {
  if (payment.fineId) return "Overstay fine";
  if (payment.subscriptionId) return "Monthly pass";
  return "Parking";
}

function FineRow({ fine, onPaid }) {
  const { profile } = useSession();
  const { busy, run } = useAction();
  const [method, setMethod] = useState("UPI");

  async function pay() {
    const ok = await run(
      "pay",
      () => post(`/payments/fines/${fine._id}`, { userId: profile.id, paymentMethod: method }),
      (d) => `Fine of ${rupees(d.payment.amount)} paid.`
    );
    if (ok) onPaid();
  }

  return (
    <div className="list-item fine-row">
      <div>
        <div className="fine-amount">{rupees(fine.fineAmount)}</div>
        <div className="muted small">
          {fine.overdueMinutes} min over your booking · {formatDateTime(fine.createdAt)}
        </div>
      </div>
      {fine.status === "UNPAID" ? (
        <div className="actions">
          <select value={method} onChange={(e) => setMethod(e.target.value)} aria-label="Pay with">
            {PAYMENT_METHODS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <button type="button" className="btn btn-primary btn-sm" onClick={pay} disabled={busy === "pay"}>
            {busy === "pay" ? "Paying…" : "Pay fine"}
          </button>
        </div>
      ) : (
        <StatusTag status={fine.status} />
      )}
    </div>
  );
}

export default function Payments() {
  const { profile } = useSession();
  const { data, error, reload } = useLoad(
    () =>
      Promise.all([
        get(`/overstays/my/${profile.id}`).then((d) => d.fines),
        get(`/payments/my/${profile.id}`).then((d) => d.transactions)
      ]).then(([fines, payments]) => ({ fines, payments })),
    [profile.id]
  );

  const unpaid = data?.fines.filter((f) => f.status === "UNPAID") || [];
  const thisMonth = (data?.payments || [])
    .filter((p) => p.status === "SUCCESS" && new Date(p.createdAt).getMonth() === new Date().getMonth())
    .reduce((sum, p) => sum + p.amount, 0);

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1>Fines & payments</h1>
          <p>Every payment you've made, and any overstay fines. A fine can be paid once you've checked out.</p>
        </div>
        {data && (
          <div className="stat-inline">
            <span className="label">Spent this month</span>
            <strong>{rupees(thisMonth)}</strong>
          </div>
        )}
      </div>

      {error && <LoadError error={error} onRetry={reload} />}
      {!data && !error && <p className="muted small">Loading…</p>}

      {data && (
        <div className="cols">
          <section className="panel">
            <div className="panel-head">
              <h2>Overstay fines</h2>
              {unpaid.length > 0 && <span className="tag warn">{unpaid.length} unpaid</span>}
            </div>
            {data.fines.length === 0 ? (
              <Empty title="No fines">Nice. Keep leaving on time.</Empty>
            ) : (
              <div className="list">
                {data.fines.map((fine) => <FineRow key={fine._id} fine={fine} onPaid={reload} />)}
              </div>
            )}
          </section>

          <section className="panel">
            <div className="panel-head">
              <h2>Payment history</h2>
              <span className="hint">{data.payments.length} payments</span>
            </div>
            {data.payments.length === 0 ? (
              <Empty title="No payments yet" />
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr><th>When</th><th>For</th><th>Paid with</th><th>Status</th><th className="num-cell">Amount</th></tr>
                  </thead>
                  <tbody>
                    {data.payments.map((p) => (
                      <tr key={p._id}>
                        <td>{formatDateTime(p.createdAt)}</td>
                        <td>{paidFor(p)}</td>
                        <td>{METHOD_LABEL[p.paymentMethod] || p.paymentMethod}</td>
                        <td><StatusTag status={p.status} /></td>
                        <td className="num-cell"><strong>{rupees(p.amount)}</strong></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
