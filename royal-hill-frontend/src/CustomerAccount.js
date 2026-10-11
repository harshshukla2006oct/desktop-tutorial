import React, { useEffect, useState } from "react";
import "./CustomerAccount.css";

const accountProducts = [
  { id: 1, name: "Farm Fresh Milk", milk: true },
  { id: 2, name: "Fresh Cow Milk", milk: true },
  { id: 3, name: "Creamy Paneer" },
  { id: 4, name: "Pure Desi Ghee" },
  { id: 5, name: "Kesar Peda" },
  { id: 6, name: "Thick Curd" },
  { id: 7, name: "Malai Paneer" },
  { id: 8, name: "A2 Cow Ghee" },
  { id: 9, name: "Milk Cake" },
];
const sizesFor = (productId) => [1, 2].includes(Number(productId)) ? ["500 ml", "1 L", "2 L"] : ["250 gm", "500 gm", "1 kg"];

async function accountRequest(path, options = {}) {
  const response = await fetch(path, {
    credentials: "same-origin",
    ...options,
    headers: { ...(options.body ? { "Content-Type": "application/json" } : {}), ...(options.headers || {}) },
  });
  let result = {};
  try { result = await response.json(); } catch { result = {}; }
  if (!response.ok) throw new Error(result.error || "We couldn’t complete that request. Please try again.");
  return result;
}

function CustomerAccount({ onBack }) {
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [email, setEmail] = useState("");
  const [method, setMethod] = useState("email");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(() => {
    const reason = new URLSearchParams(window.location.search).get("phoneEmailError");
    if (reason === "setup") return "Phone verification is not configured yet. Please contact us for help.";
    if (reason === "unsupported-number") return "Phone verification currently supports Indian mobile numbers only.";
    if (reason === "rate-limit") return "Too many sign-in attempts. Please wait and try again.";
    return reason ? "Phone verification could not be completed. Please try again." : "";
  });
  const [tab, setTab] = useState("General");
  const [profile, setProfile] = useState({ name: "", phone: "", email: "", address: "", pin: "" });
  const [dailyOrders, setDailyOrders] = useState([]);
  const [history, setHistory] = useState([]);
  const [historyOffset, setHistoryOffset] = useState(0);
  const [historyHasMore, setHistoryHasMore] = useState(false);
  const [newItem, setNewItem] = useState({ productId: "1", size: "1 L", quantity: 1 });

  const loadAccount = async () => {
    const result = await accountRequest("/api/account/session");
    setProfile(result.profile);
    setEmail(result.profile.email || "");
    const daily = await accountRequest("/api/account/daily-orders");
    setDailyOrders(daily.entries);
    const orders = await accountRequest("/api/account/orders?limit=50&offset=0");
    setHistory(orders.entries);
    setHistoryOffset(orders.entries.length);
    setHistoryHasMore(orders.hasMore);
  };

  useEffect(() => {
    let current = true;
    accountRequest("/api/account/session")
      .then(async (result) => {
        if (!current) return;
        setAuthenticated(true);
        setProfile(result.profile);
        setEmail(result.profile.email || "");
        const [daily, orders] = await Promise.all([
          accountRequest("/api/account/daily-orders"),
          accountRequest("/api/account/orders?limit=50&offset=0"),
        ]);
        if (!current) return;
        setDailyOrders(daily.entries);
        setHistory(orders.entries);
        setHistoryOffset(orders.entries.length);
        setHistoryHasMore(orders.hasMore);
      })
      .catch(() => { if (current) setAuthenticated(false); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, []);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.has("account") || url.searchParams.has("phoneEmailError")) {
      url.searchParams.delete("account");
      url.searchParams.delete("phoneEmailError");
      window.history.replaceState({}, "", url.pathname + url.search + url.hash);
    }
  }, []);

  const startPhoneEmail = () => {
    setBusy(true);
    setMessage("");
    window.location.assign("/api/auth/phone-email/start");
  };

  const sendOtp = async (event) => {
    event.preventDefault();
    setBusy(true); setMessage("");
    try {
      const result = await accountRequest("/api/auth/send-otp", {
        method: "POST", body: JSON.stringify({ method: "email", identifier: email }),
      });
      setOtpSent(true);
      setMessage(result.message || "A verification code was sent to your mobile.");
    } catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  };

  const verifyOtp = async (event) => {
    event.preventDefault();
    setBusy(true); setMessage("");
    try {
      const result = await accountRequest("/api/auth/verify-otp", {
        method: "POST", body: JSON.stringify({ method: "email", identifier: email, code: otp }),
      });
      window.location.assign("/customer");
      return;
    } catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  };

  const saveProfile = async (event) => {
    event.preventDefault();
    setBusy(true); setMessage("");
    try {
      const result = await accountRequest("/api/account/profile", {
        method: "PUT", body: JSON.stringify({ name: profile.name, address: profile.address, pin: profile.pin }),
      });
      setProfile(result.profile);
      setMessage("Your details have been saved.");
    } catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  };

  const addDailyOrder = async (event) => {
    event.preventDefault();
    setBusy(true); setMessage("");
    try {
      await accountRequest("/api/account/daily-orders", {
        method: "POST", body: JSON.stringify(newItem),
      });
      const result = await accountRequest("/api/account/daily-orders");
      setDailyOrders(result.entries);
      setMessage("Item added to your daily delivery list.");
    } catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  };

  const updateDailyOrder = async (entry, changes) => {
    setBusy(true); setMessage("");
    try {
      await accountRequest("/api/account/daily-orders/" + entry.id, {
        method: "PATCH", body: JSON.stringify(changes),
      });
      const result = await accountRequest("/api/account/daily-orders");
      setDailyOrders(result.entries);
    } catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  };

  const removeDailyOrder = async (entry) => {
    setBusy(true); setMessage("");
    try {
      await accountRequest("/api/account/daily-orders/" + entry.id, { method: "DELETE" });
      setDailyOrders((items) => items.filter((item) => item.id !== entry.id));
      setMessage("Item removed from your daily delivery list.");
    } catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  };

  const loadMoreHistory = async () => {
    setBusy(true); setMessage("");
    try {
      const result = await accountRequest("/api/account/orders?limit=50&offset=" + historyOffset);
      setHistory((items) => [...items, ...result.entries]);
      setHistoryOffset((offset) => offset + result.entries.length);
      setHistoryHasMore(result.hasMore);
    } catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  };

  const logout = async () => {
    setBusy(true);
    try { await accountRequest("/api/auth/logout", { method: "POST" }); }
    catch (error) { setMessage(error.message); }
    setAuthenticated(false); setOtp(""); setOtpSent(false); setProfile({ name: "", phone: "", email: "", address: "", pin: "" }); setBusy(false);
  };

  const changeNewProduct = (productId) => {
    const nextSize = sizesFor(productId)[0];
    setNewItem((item) => ({ ...item, productId, size: nextSize }));
  };

  if (loading) {
    return <main className="customer-account-page"><div className="customer-account-loading">Loading your account…</div></main>;
  }

  return (
    <main className="customer-account-page">
      <header className="customer-account-header">
        <a className="logo" href="#home" onClick={(event) => { event.preventDefault(); onBack(); }}>
          <span className="logo-mark">✿</span><span>Royal Hill <b>Dairy</b></span>
        </a>
        <button className="checkout-back" onClick={onBack}>← Back to shop</button>
      </header>

      {!authenticated ? (
        <section className="account-login-card">
          <p className="eyebrow">YOUR ROYAL HILL ACCOUNT</p>
          <h1>{otpSent ? "Verify your email" : "Login or create an account"}</h1>
          <p className="account-intro">Sign in or register using a one-time code sent to your email or mobile.</p>
          {!otpSent && <div className="account-method-picker" role="group" aria-label="Verification method">
            <button type="button" className={method === "email" ? "selected" : ""} onClick={() => { setMethod("email"); setOtp(""); setMessage(""); }}>Email</button>
            <button type="button" className={method === "phone" ? "selected" : ""} onClick={() => { setMethod("phone"); setOtp(""); setOtpSent(false); setMessage(""); }}>Phone verification</button>
          </div>}
          {!otpSent ? (
            method === "email" ? (
              <form className="account-login-form" onSubmit={sendOtp}>
                <label>Email address<input type="email" autoComplete="email" maxLength="254" value={email} onChange={(event) => setEmail(event.target.value.trim())} placeholder="you@example.com" required /></label>
                <button className="checkout-primary" disabled={busy}>{busy ? "Sending code…" : "Send email code"} <span>→</span></button>
              </form>
            ) : (
              <div className="account-login-form">
                <p className="account-section-note">Phone.email will verify your mobile number securely, then connect it to your Royal Hill account.</p>
                <button type="button" className="checkout-primary" disabled={busy} onClick={startPhoneEmail}>Continue with Phone.email <span>→</span></button>
              </div>
            )
          ) : (
            <form className="account-login-form" onSubmit={verifyOtp}>
              <label>Verification code
                <input inputMode="numeric" autoComplete="one-time-code" maxLength="10" value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 10))} placeholder="Enter the code from your email" required />
              </label>
              <div className="account-otp-actions">
                <button className="checkout-primary" disabled={busy}>{busy ? "Verifying…" : "Verify and continue"} <span>→</span></button>
                <button type="button" className="account-text-button" disabled={busy} onClick={() => { setOtpSent(false); setOtp(""); setMessage(""); }}>Change email</button>
              </div>
            </form>
          )}
          {message && <p className="account-message" role="status">{message}</p>}
          <p className="account-login-footnote">New here? Your account will be created after you verify your {method === "email" ? "email address" : "mobile number"}.</p>
        </section>
      ) : (
        <div className="customer-account-layout">
          <aside className="customer-account-nav">
            <p className="account-nav-title">MY ACCOUNT</p>
            {["General", "Daily order", "Orders history"].map((name) => (
              <button key={name} className={tab === name ? "active" : ""} onClick={() => { setTab(name); setMessage(""); }}>
                <span>{name === "General" ? "◉" : name === "Daily order" ? "↻" : "▤"}</span>{name}
              </button>
            ))}
            <button className="account-logout-button" disabled={busy} onClick={logout}><span>↪</span>Log out</button>
          </aside>
          <section className="customer-account-content">
            <div className="account-content-heading">
              <div>
                <p className="eyebrow">ROYAL HILL MEMBERSHIP</p>
                <h1>{tab === "General" ? "General" : tab === "Daily order" ? "Daily delivery" : "Orders history"}</h1>
              </div>
              <span className="account-verified-badge">{profile.phone ? "✓ Mobile verified" : "✓ Email verified"}</span>
            </div>

            {tab === "General" && (
              <form className="account-profile-card" onSubmit={saveProfile}>
                <p className="account-section-note">Keep your contact and delivery details up to date.</p>
                <label>Full name<input name="name" autoComplete="name" value={profile.name} onChange={(event) => setProfile((current) => ({ ...current, name: event.target.value }))} placeholder="Your full name" minLength="2" maxLength="100" required /></label>
                <label>Mobile number {profile.phone ? <span className="verified-inline">Verified by OTP</span> : <span className="account-unverified-inline">Not verified</span>}<input value={profile.phone ? "+91 " + profile.phone : "Not added"} readOnly /></label>
                <label>Email address {profile.email ? <span className="verified-inline">Verified by OTP</span> : <span className="account-unverified-inline">Not verified</span>}<input value={profile.email || "Not added"} readOnly /></label>
                <label className="account-wide-field">Delivery address<textarea name="address" autoComplete="street-address" rows="3" maxLength="500" value={profile.address} onChange={(event) => setProfile((current) => ({ ...current, address: event.target.value }))} placeholder="House / flat, street, area" required /></label>
                <label>PIN code<input name="pin" inputMode="numeric" autoComplete="postal-code" pattern="[0-9]{6}" maxLength="6" value={profile.pin} onChange={(event) => setProfile((current) => ({ ...current, pin: event.target.value.replace(/\D/g, "").slice(0, 6) }))} placeholder="6-digit PIN code" required /></label>
                <div className="account-form-actions"><button className="checkout-primary" disabled={busy}>{busy ? "Saving…" : "Save details"} <span>✓</span></button></div>
              </form>
            )}

            {tab === "Daily order" && (
              <div className="account-daily-section">
                <div className="account-section-heading"><div><h2>Your daily delivery list</h2><p>Manage the items you want included in your daily delivery.</p></div></div>
                <form className="daily-order-add-form" onSubmit={addDailyOrder}>
                  <label>Product<select value={newItem.productId} onChange={(event) => changeNewProduct(event.target.value)}>{accountProducts.map((product) => <option value={product.id} key={product.id}>{product.name}</option>)}</select></label>
                  <label>Size<select value={newItem.size} onChange={(event) => setNewItem((item) => ({ ...item, size: event.target.value }))}>{sizesFor(newItem.productId).map((size) => <option value={size} key={size}>{size}</option>)}</select></label>
                  <label>Qty<input type="number" min="1" max="99" value={newItem.quantity} onChange={(event) => setNewItem((item) => ({ ...item, quantity: event.target.value }))} required /></label>
                  <button className="checkout-primary" disabled={busy}>＋ Add item</button>
                </form>
                {dailyOrders.length ? (
                  <div className="daily-order-list">
                    {dailyOrders.map((entry) => (
                      <article className={"daily-order-row " + (entry.is_active ? "" : "paused")} key={entry.id}>
                        <span className="daily-order-icon">{[1, 2].includes(Number(entry.product_id)) ? "🥛" : "✿"}</span>
                        <div className="daily-order-details"><strong>{entry.product_name}</strong><span>{entry.size} · Qty {entry.quantity} · Every day</span><small>{entry.is_active ? "Active" : "Paused"}</small></div>
                        <div className="daily-order-actions">
                          <button type="button" disabled={busy || entry.quantity <= 1} aria-label="Reduce daily quantity" onClick={() => updateDailyOrder(entry, { quantity: Number(entry.quantity) - 1 })}>−</button>
                          <button type="button" disabled={busy || entry.quantity >= 99} aria-label="Increase daily quantity" onClick={() => updateDailyOrder(entry, { quantity: Number(entry.quantity) + 1 })}>+</button>
                          <button type="button" className="daily-pause-button" disabled={busy} onClick={() => updateDailyOrder(entry, { isActive: !entry.is_active })}>{entry.is_active ? "Pause" : "Resume"}</button>
                          <button type="button" className="daily-remove-button" disabled={busy} onClick={() => removeDailyOrder(entry)}>Remove</button>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : <div className="account-empty-state"><span>🥛</span><h3>Your daily list is empty</h3><p>Use “Add item” above to start a daily delivery list.</p></div>}
              </div>
            )}

            {tab === "Orders history" && (
              <div className="account-history-section">
                <p className="account-section-note">Your verified mobile number is used to find your saved orders. History stays here even when you remove items from your daily list.</p>
                {history.length ? (
                  <>
                    <div className="account-order-list">
                      {history.map((order) => {
                        const items = Array.isArray(order.items) ? order.items : [];
                        return (
                          <article className="account-history-card" key={order.id}>
                            <div className="account-history-head">
                              <div><span>Order #{order.id}</span><small>{new Date(order.created_at).toLocaleString()}</small></div>
                              <strong>₹{order.total_rupees}</strong>
                            </div>
                            <p className="account-history-meta">{order.order_type === "subscription" ? "Subscription request" : "Order"} · {String(order.payment_method).toUpperCase()}</p>
                            <ul>{items.map((item, index) => <li key={index}><span>{item.name} · {item.size} × {item.quantity}</span><strong>₹{item.lineTotal}</strong></li>)}</ul>
                            <div className="account-history-delivery"><span>{order.customer_name}</span><span>{order.phone}</span><span>{order.delivery_address}, PIN {order.postal_code}</span></div>
                          </article>
                        );
                      })}
                    </div>
                    {historyHasMore && <button className="account-load-more" disabled={busy} onClick={loadMoreHistory}>{busy ? "Loading…" : "Load older orders"}</button>}
                  </>
                ) : <div className="account-empty-state"><span>▤</span><h3>No orders yet</h3><p>Your future shop orders will appear here after you place them with this verified mobile number.</p></div>}
              </div>
            )}
            {message && <p className="account-message" role="status">{message}</p>}
          </section>
        </div>
      )}
    </main>
  );
}

export default CustomerAccount;
