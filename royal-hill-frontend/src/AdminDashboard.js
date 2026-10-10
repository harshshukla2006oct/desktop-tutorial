import React, { useCallback, useEffect, useState } from "react";
import "./AdminDashboard.css";

const pageSize = 50;

function formatDate(value) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(new Date(value));
}

function AdminDashboard() {
  const [authState, setAuthState] = useState("checking");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [entries, setEntries] = useState([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);

  const loadEntries = useCallback(async (nextOffset = 0) => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/orders?limit=" + pageSize + "&offset=" + nextOffset);
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not load customer entries.");
      setEntries(result.entries);
      setTotal(result.total);
      setOffset(nextOffset);
    } catch (loadError) {
      setError(loadError.message || "Could not load customer entries.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch("/api/admin/session")
      .then((response) => {
        if (response.ok) {
          setAuthState("authenticated");
          loadEntries(0);
        } else {
          setAuthState("signed-out");
        }
      })
      .catch(() => {
        setAuthState("signed-out");
        setError("Dashboard service is unavailable. Please try again.");
      });
  }, [loadEntries]);

  const signIn = async (event) => {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Sign-in failed.");
      setPassword("");
      setAuthState("authenticated");
      await loadEntries(0);
    } catch (loginError) {
      setError(loginError.message || "Sign-in failed.");
    } finally {
      setLoading(false);
    }
  };

  const signOut = async () => {
    await fetch("/api/admin/logout", { method: "POST" }).catch(() => {});
    setEntries([]);
    setAuthState("signed-out");
  };

  if (authState === "checking") {
    return <main className="admin-shell"><p className="admin-loading">Opening the Royal Hill order dashboard…</p></main>;
  }

  if (authState !== "authenticated") {
    return (
      <main className="admin-shell admin-login-shell">
        <section className="admin-login-card">
          <a className="admin-brand" href="/">✿ <span>Royal Hill <b>Dairy</b></span></a>
          <p className="admin-eyebrow">PRIVATE DASHBOARD</p>
          <h1>Sign in to orders</h1>
          <p className="admin-intro">Customer details are visible only after admin sign-in.</p>
          <form onSubmit={signIn}>
            <label htmlFor="admin-password">Admin password</label>
            <input
              id="admin-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
            {error && <p className="admin-error" role="alert">{error}</p>}
            <button className="admin-primary" type="submit" disabled={loading}>
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>
          <a className="admin-back-link" href="/">← Back to shop</a>
        </section>
      </main>
    );
  }

  return (
    <main className="admin-shell">
      <header className="admin-topbar">
        <a className="admin-brand" href="/">✿ <span>Royal Hill <b>Dairy</b></span></a>
        <div className="admin-top-actions">
          <a href="/">View shop</a>
          <button type="button" onClick={signOut}>Sign out</button>
        </div>
      </header>

      <section className="admin-content">
        <div className="admin-heading-row">
          <div>
            <p className="admin-eyebrow">CUSTOMER REQUESTS</p>
            <h1>Order dashboard</h1>
            <p className="admin-intro">Newest entries appear first.</p>
          </div>
          <button className="admin-refresh" type="button" onClick={() => loadEntries(0)} disabled={loading}>
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>

        {error && <p className="admin-error admin-page-error" role="alert">{error}</p>}
        <div className="admin-count">{total} {total === 1 ? "request" : "requests"}</div>

        {entries.length === 0 && !loading ? (
          <section className="admin-empty">
            <span>✿</span>
            <h2>No requests yet</h2>
            <p>New orders and subscriptions will appear here when customers submit them.</p>
          </section>
        ) : (
          <div className="admin-entry-list">
            {entries.map((entry) => (
              <article className="admin-entry" key={entry.id}>
                <div className="admin-entry-heading">
                  <div>
                    <span className="admin-order-id">Request #{entry.id}</span>
                    <span className={"admin-type " + (entry.order_type === "subscription" ? "subscription" : "")}>
                      {entry.order_type === "subscription" ? "Subscription" : "Shop order"}
                    </span>
                  </div>
                  <time dateTime={entry.created_at}>{formatDate(entry.created_at)}</time>
                </div>
                <div className="admin-entry-grid">
                  <section>
                    <h2>Customer</h2>
                    <p className="admin-customer-name">{entry.customer_name}</p>
                    <p><a href={"tel:" + entry.phone.trim()}>{entry.phone.trim()}</a></p>
                  </section>
                  <section>
                    <h2>Delivery address</h2>
                    <p>{entry.delivery_address}</p>
                    <p>PIN {entry.postal_code.trim()}</p>
                  </section>
                  <section>
                    <h2>Request details</h2>
                    <ul className="admin-items">
                      {entry.items.map((item, index) => (
                        <li key={index}>
                          {item.name} · {item.size} · Qty {item.quantity} · ₹{item.lineTotal}
                        </li>
                      ))}
                    </ul>
                    <p className="admin-payment-line">Preference: {entry.payment_method.toUpperCase()}</p>
                    <strong className="admin-total">₹{entry.total_rupees}</strong>
                  </section>
                </div>
              </article>
            ))}
          </div>
        )}

        {total > pageSize && (
          <nav className="admin-pagination" aria-label="Customer request pages">
            <button type="button" onClick={() => loadEntries(Math.max(0, offset - pageSize))} disabled={offset === 0 || loading}>Newer</button>
            <span>{offset + 1}–{Math.min(offset + entries.length, total)} of {total}</span>
            <button type="button" onClick={() => loadEntries(offset + pageSize)} disabled={offset + pageSize >= total || loading}>Older</button>
          </nav>
        )}
        <p className="admin-privacy-note">Customer delivery details are shown only in this signed-in dashboard.</p>
      </section>
    </main>
  );
}

export default AdminDashboard;
