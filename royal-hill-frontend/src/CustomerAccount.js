import React, { useEffect, useState } from "react";
import "./CustomerAccount.css";

const accountProducts = [
  { id: 1, name: "Fresh Buffalo Milk", milk: true },
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

const getLocalDateKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const getMonthKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
const getDateFromKey = (key) => { const [year, month, day] = key.split("-").map(Number); return new Date(year, month - 1, day); };

function CustomerAccount({ onBack }) {
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [authMode, setAuthMode] = useState("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [tab, setTab] = useState("General");
  const [profile, setProfile] = useState({ name: "", phone: "", email: "", username: "", address: "", pin: "" });
  const [dailyOrders, setDailyOrders] = useState([]);
  const [history, setHistory] = useState([]);
  const [historyOffset, setHistoryOffset] = useState(0);
  const [historyHasMore, setHistoryHasMore] = useState(false);
  const [newItem, setNewItem] = useState({ productId: "1", size: "1 L", quantity: 1 });
  const [calendarMonth, setCalendarMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [selectedSubscriptionDate, setSelectedSubscriptionDate] = useState(() => getLocalDateKey(new Date()));
  const [subscriptionDays, setSubscriptionDays] = useState([]);
  const [subscriptionStatus, setSubscriptionStatus] = useState(null);

  useEffect(() => {
    let current = true;
    accountRequest("/api/account/session")
      .then(async (result) => {
        if (!current) return;
        setAuthenticated(true);
        setProfile(result.profile);
        const [daily, orders, subscription] = await Promise.all([
          accountRequest("/api/account/daily-orders"),
          accountRequest("/api/account/orders?limit=50&offset=0"),
          accountRequest("/api/account/subscription").catch(() => ({ active: false })),
        ]);
        if (!current) return;
        setDailyOrders(daily.entries);
        setSubscriptionStatus(subscription);
        setHistory(orders.entries);
        setHistoryOffset(orders.entries.length);
        setHistoryHasMore(orders.hasMore);
      })
      .catch(() => { if (current) setAuthenticated(false); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, []);


  useEffect(() => {
    if (!subscriptionStatus?.active || !subscriptionStatus.endsAt) return undefined;
    const expiresAt = new Date(subscriptionStatus.endsAt).getTime();
    if (!Number.isFinite(expiresAt)) return undefined;
    let timerId;
    const checkExpiry = () => {
      const remaining = expiresAt - Date.now();
      if (remaining <= 0) {
        setSubscriptionStatus((current) => current?.endsAt === subscriptionStatus.endsAt ? { ...current, active: false } : current);
        setSubscriptionDays([]);
        return;
      }
      timerId = window.setTimeout(checkExpiry, Math.min(remaining, 2147483647));
    };
    checkExpiry();
    return () => window.clearTimeout(timerId);
  }, [subscriptionStatus?.active, subscriptionStatus?.endsAt]);

  useEffect(() => {
    if (!authenticated || !subscriptionStatus?.active) return undefined;
    let current = true;
    accountRequest("/api/account/subscription-days?month=" + getMonthKey(calendarMonth))
      .then((result) => { if (current) setSubscriptionDays(result.entries || []); })
      .catch((error) => { if (current) setMessage(error.message); });
    return () => { current = false; };
  }, [authenticated, subscriptionStatus?.active, calendarMonth, dailyOrders]);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.has("account") || url.searchParams.has("subscription")) {
      url.searchParams.delete("account");
      url.searchParams.delete("subscription");
      window.history.replaceState({}, "", url.pathname + url.search + url.hash);
    }
  }, []);

  const submitCredentials = async (event) => {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    if (authMode === "register" && password !== confirmPassword) {
      setMessage("The passwords do not match.");
      setBusy(false);
      return;
    }
    try {
      await accountRequest(authMode === "register" ? "/api/auth/register" : "/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password }),
      });
      window.location.assign("/customer");
    } catch (error) {
      setMessage(error.message);
      setBusy(false);
    }
  };

  const saveProfile = async (event) => {
    event.preventDefault();
    setBusy(true); setMessage("");
    try {
      const result = await accountRequest("/api/account/profile", {
        method: "PUT", body: JSON.stringify({ name: profile.name, phone: profile.phone, address: profile.address, pin: profile.pin }),
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
    try {
      await accountRequest("/api/auth/logout", { method: "POST" });
      window.location.assign("/");
    } catch (error) { setMessage(error.message); setBusy(false); }
  };


  const saveSubscriptionStatus = async (status) => {
    if (selectedSubscriptionDate < getLocalDateKey(new Date())) return;
    if (status === "on" && !dailyOrders.some((entry) => entry.is_active && accountProducts.find((product) => product.id === Number(entry.product_id))?.milk)) {
      setMessage("Add an active milk item in Daily order before scheduling a delivery.");
      return;
    }
    setBusy(true); setMessage("");
    try {
      const result = await accountRequest("/api/account/subscription-days/" + selectedSubscriptionDate, {
        method: "PUT", body: JSON.stringify({ status }),
      });
      setSubscriptionDays((entries) => [...entries.filter((entry) => String(entry.delivery_date).slice(0, 10) !== selectedSubscriptionDate), result.entry]);
      setMessage(status === "on" ? "Milk delivery scheduled for this day." : "Milk delivery cancelled for this day.");
    } catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  };

  const todayKey = getLocalDateKey(new Date());
  const selectedDay = subscriptionDays.find((entry) => String(entry.delivery_date).slice(0, 10) === selectedSubscriptionDate);
  const activeMilkItems = dailyOrders.filter((entry) => entry.is_active && accountProducts.find((product) => product.id === Number(entry.product_id))?.milk);
  const calendarStart = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1);
  const calendarDayCount = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0).getDate();
  const calendarCells = [...Array((calendarStart.getDay() + 6) % 7).fill(null), ...Array.from({ length: calendarDayCount }, (_, index) => new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), index + 1))];

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
          <h1>{authMode === "register" ? "Create your account" : "Sign in"}</h1>
          <p className="account-intro">Use a unique username and password to access your customer dashboard.</p>
          <form className="account-login-form" onSubmit={submitCredentials}>
            <label>Username
              <input autoComplete="username" minLength="3" maxLength="24" pattern="[A-Za-z0-9_]{3,24}" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="Choose a username" required />
            </label>
            <label>Password
              <input type="password" autoComplete={authMode === "register" ? "new-password" : "current-password"} minLength="8" maxLength="128" value={password} onChange={(event) => setPassword(event.target.value)} placeholder={authMode === "register" ? "At least 8 characters" : "Your password"} required />
            </label>
            {authMode === "register" && (
              <label>Confirm password
                <input type="password" autoComplete="new-password" minLength="8" maxLength="128" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Enter your password again" required />
              </label>
            )}
            <button className="checkout-primary" disabled={busy}>
              {busy ? "Please wait…" : authMode === "register" ? "Create account" : "Sign in"} <span>→</span>
            </button>
          </form>
          {message && <p className="account-message" role="status">{message}</p>}
          <p className="account-login-footnote">
            {authMode === "register" ? "Already have an account? " : "New to Royal Hill? "}
            <button type="button" className="account-text-button" disabled={busy} onClick={() => { setAuthMode(authMode === "register" ? "login" : "register"); setMessage(""); }}>
              {authMode === "register" ? "Sign in" : "Create an account"}
            </button>
          </p>
        </section>
      ) : (
        <div className="customer-account-layout">
          <aside className="customer-account-nav">
            <p className="account-nav-title">MY ACCOUNT</p>
            {["General", "Daily order", "Your subscription", "Orders history"].map((name) => (
              <button key={name} className={tab === name ? "active" : ""} onClick={() => { setTab(name); setMessage(""); }}>
                <span>{name === "General" ? "◉" : name === "Daily order" ? "↻" : name === "Your subscription" ? "▦" : "▤"}</span>{name}
              </button>
            ))}
            <button className="account-logout-button" disabled={busy} onClick={logout}><span>↪</span>Log out</button>
          </aside>
          <section className="customer-account-content">
            <div className="account-content-heading">
              <div>
                <p className="eyebrow">ROYAL HILL MEMBERSHIP</p>
                <h1>{tab === "General" ? "General" : tab === "Daily order" ? "Daily delivery" : tab === "Your subscription" ? "Your subscription" : "Orders history"}</h1>
              </div>
              <span className="account-verified-badge">{"@" + profile.username}</span>
            </div>

            {tab === "General" && (
              <form className="account-profile-card" onSubmit={saveProfile}>
                <p className="account-section-note">Keep your contact and delivery details up to date.</p>
                <label>Full name<input name="name" autoComplete="name" value={profile.name} onChange={(event) => setProfile((current) => ({ ...current, name: event.target.value }))} placeholder="Your full name" minLength="2" maxLength="100" required /></label>
                <label>Username<input value={profile.username || ""} readOnly /></label>
                <label>Mobile number (optional)<input type="tel" inputMode="numeric" pattern="[0-9]{10}" maxLength="10" value={profile.phone || ""} onChange={(event) => setProfile((current) => ({ ...current, phone: event.target.value.replace(/\D/g, "").slice(0, 10) }))} placeholder="10-digit mobile number" /></label>
                <label className="account-wide-field">Delivery address<textarea name="address" autoComplete="street-address" rows="3" maxLength="500" value={profile.address} onChange={(event) => setProfile((current) => ({ ...current, address: event.target.value }))} placeholder="House / flat, street, area" required /></label>
                <label>PIN code<input name="pin" inputMode="numeric" autoComplete="postal-code" pattern="[0-9]{6}" maxLength="6" value={profile.pin} onChange={(event) => setProfile((current) => ({ ...current, pin: event.target.value.replace(/\D/g, "").slice(0, 6) }))} placeholder="6-digit PIN code" required /></label>
                <div className="account-form-actions"><button className="checkout-primary" disabled={busy}>{busy ? "Saving…" : "Save details"} <span>✓</span></button></div>
              </form>
            )}


            {tab === "Your subscription" && !subscriptionStatus?.active && (
              <div className="account-subscription-section">
                <div className="account-section-heading"><div><h2>Choose a subscription plan</h2><p>Your delivery calendar will appear here after you save a subscription plan.</p></div></div>
                <div className="account-plan-grid">
                  <article className="account-plan-card">
                    <span className="account-plan-icon">🥛</span><h3>Daily Cow Milk</h3>
                    <p>1 litre of fresh cow milk scheduled daily for 30 days.</p>
                    <strong>₹260 <small>/ 30 days</small></strong>
                    <button type="button" className="checkout-primary" onClick={() => window.location.assign("/?subscription=details&plan=daily-milk")}>Choose plan <span>→</span></button>
                  </article>
                  <article className="account-plan-card">
                    <span className="account-plan-icon">✦</span><h3>Fresh Plus</h3>
                    <p>Same-day dairy delivery with member extras for 30 days.</p>
                    <strong>₹460 <small>/ 30 days</small></strong>
                    <button type="button" className="checkout-primary" onClick={() => window.location.assign("/?subscription=details&plan=fresh-plus")}>Choose plan <span>→</span></button>
                  </article>
                </div>
                <p className="account-plan-note">You’ll continue to the plan request page. The current checkout saves a request and does not take payment online.</p>
              </div>
            )}

            {tab === "Your subscription" && subscriptionStatus?.active && (
              <div className="account-subscription-section">
                <div className="account-section-heading"><div><h2>{subscriptionStatus.planName || "Your active plan"}</h2><p>30-day subscription · Access expires {new Date(subscriptionStatus.endsAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}. Choose which days you want milk delivered.</p></div></div>

                <div className="account-section-heading"><div><h2>Choose your milk delivery days</h2><p>Each new day starts ON. Turn a day OFF to cancel that delivery.</p></div></div>
                <div className="subscription-calendar-layout">
                  <section className="subscription-calendar-card" aria-label="Delivery calendar">
                    <div className="subscription-calendar-heading">
                      <button type="button" aria-label="Previous month" onClick={() => setCalendarMonth((month) => new Date(month.getFullYear(), month.getMonth() - 1, 1))}>‹</button>
                      <h3>{calendarMonth.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</h3>
                      <button type="button" aria-label="Next month" onClick={() => setCalendarMonth((month) => new Date(month.getFullYear(), month.getMonth() + 1, 1))}>›</button>
                    </div>
                    <div className="subscription-calendar-grid subscription-calendar-weekdays">{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => <span key={day}>{day}</span>)}</div>
                    <div className="subscription-calendar-grid">
                      {calendarCells.map((date, index) => {
                        if (!date) return <span className="subscription-calendar-blank" key={"blank-" + index} />;
                        const dateKey = getLocalDateKey(date);
                        const savedDay = subscriptionDays.find((entry) => String(entry.delivery_date).slice(0, 10) === dateKey);
                        const defaultOn = dateKey >= todayKey && activeMilkItems.length > 0;
                        const status = savedDay?.status || (defaultOn ? "on" : "");
                        const isSelected = selectedSubscriptionDate === dateKey;
                        return (
                          <button type="button" key={dateKey} className={"subscription-calendar-day " + (isSelected ? "selected " : "") + (status ? status : "") + (dateKey === todayKey ? " today" : "")} onClick={() => { setSelectedSubscriptionDate(dateKey); setMessage(""); }} aria-label={date.toLocaleDateString(undefined, { dateStyle: "full" }) + (status === "on" ? ", delivery on" : status === "off" ? ", delivery cancelled" : "")}>
                            <span>{date.getDate()}</span>{status === "on" ? <b className="calendar-mark" aria-label="Scheduled">✓</b> : status === "off" ? <b className="calendar-mark" aria-label="Cancelled">×</b> : null}
                          </button>
                        );
                      })}
                    </div>
                    <div className="subscription-calendar-legend"><span><b className="legend-on">✓</b> Delivery ON</span><span><b className="legend-off">×</b> Delivery OFF</span></div>
                  </section>
                  <section className="subscription-day-card">
                    <p className="eyebrow">DELIVERY PREFERENCE</p>
                    <h3>{getDateFromKey(selectedSubscriptionDate).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</h3>
                    <p className="subscription-day-caption">{selectedDay?.status === "off" ? "You cancelled milk for this day." : selectedDay?.status === "on" ? "Milk delivery is scheduled for this day." : selectedSubscriptionDate < todayKey ? "No saved delivery choice for this day." : "New days start ON automatically."}</p>
                    <div className="subscription-toggle" role="group" aria-label="Milk delivery for selected day">
                      <button type="button" className={(selectedDay?.status !== "off" ? "active on" : "")} disabled={busy || selectedSubscriptionDate < todayKey || (!activeMilkItems.length && selectedDay?.status !== "off")} onClick={() => saveSubscriptionStatus("on")}>ON</button>
                      <button type="button" className={(selectedDay?.status === "off" ? "active off" : "")} disabled={busy || selectedSubscriptionDate < todayKey} onClick={() => saveSubscriptionStatus("off")}>OFF</button>
                    </div>
                    {activeMilkItems.length ? (
                      <div className="subscription-day-items"><strong>Milk on your daily list</strong>{activeMilkItems.map((item) => <span key={item.id}>🥛 {item.product_name} · {item.size} × {item.quantity}</span>)}</div>
                    ) : <p className="subscription-needs-milk">Add an active milk product in Daily order to schedule delivery.</p>}
                    {selectedSubscriptionDate < todayKey && <small className="subscription-past-note">Past delivery days can’t be changed.</small>}
                  </section>
                </div>
              </div>
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
                <p className="account-section-note">Your orders are saved to this account and remain in history even when you remove items from your daily list.</p>
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
                ) : <div className="account-empty-state"><span>▤</span><h3>No orders yet</h3><p>Your shop orders will appear here after you place them while signed in to this account.</p></div>}
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
