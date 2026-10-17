import React, { useEffect, useMemo, useState } from "react";
import "./App.css";
import CustomerAccount from "./CustomerAccount";

const defaultProducts = [
  { id: 1, name: "Fresh Buffalo Milk", category: "Milk", detail: "Buffalo milk · 1 litre", price: 68, icon: "🥛", tag: "DAILY FRESH", color: "milk" },
  { id: 2, name: "Fresh Cow Milk", category: "Milk", detail: "Cow milk · 1 litre", price: 75, icon: "🥛", tag: "FRESH COW MILK", color: "milk" },
  { id: 3, name: "Creamy Paneer", category: "Paneer", detail: "Soft & fresh · 200 g", price: 110, icon: "🧀", tag: "MADE TODAY", color: "paneer" },
  { id: 4, name: "Pure Desi Ghee", category: "Ghee", detail: "Traditional bilona · 500 ml", price: 420, icon: "🫙", tag: "PURE & GOLDEN", color: "ghee" },
  { id: 5, name: "Kesar Peda", category: "Sweets", detail: "A little festive · 250 g", price: 180, icon: "🍬", tag: "FRESH SWEETS", color: "sweets" },
  { id: 6, name: "Thick Curd", category: "Milk", detail: "Creamy homemade · 400 g", price: 55, icon: "🥣", tag: "FARM FRESH", color: "curd" },
  { id: 7, name: "Malai Paneer", category: "Paneer", detail: "Rich & tender · 500 g", price: 250, icon: "🧀", tag: "FRESH TODAY", color: "paneer" },
  { id: 8, name: "A2 Cow Ghee", category: "Ghee", detail: "Small batch · 250 ml", price: 250, icon: "🫙", tag: "SMALL BATCH", color: "ghee" },
  { id: 9, name: "Milk Cake", category: "Sweets", detail: "Slow cooked · 250 g", price: 160, icon: "🍮", tag: "HOUSE SPECIAL", color: "sweets" },
];

const categoryDefaults = [
  { name: "All products", icon: "✦" },
  { name: "Milk", icon: "🥛" },
  { name: "Paneer", icon: "🧀" },
  { name: "Ghee", icon: "🫙" },
  { name: "Sweets", icon: "🍬" },
];

const paymentOptions = [
  { id: "upi", icon: "▣", title: "UPI", detail: "Google Pay, PhonePe, Paytm and more" },
  { id: "card", icon: "▤", title: "Credit or debit card", detail: "Visa, Mastercard, RuPay and more" },
  { id: "emi", icon: "▦", title: "EMI", detail: "Pay in monthly instalments" },
  { id: "netbanking", icon: "🏦", title: "Net Banking", detail: "Pay using your bank account" },
  { id: "cod", icon: "₹", title: "Cash on Delivery", detail: "Pay when your order arrives" },
];

const subscriptionPlans = [
  {
    id: "daily-milk",
    name: "Daily Cow Milk",
    price: 260,
    period: "30 days",
    icon: "🥛",
    description: "1 litre of fresh cow milk delivered on time every day for 30 days.",
    features: ["1 litre cow milk each day", "30 days of scheduled delivery", "Reliable on-time doorstep delivery"],
  },
  {
    id: "fresh-plus",
    name: "Fresh Plus",
    price: 460,
    period: "30 days",
    icon: "✦",
    description: "Fast same-day delivery for multiple dairy products, with member extras.",
    features: ["Fast same-day delivery for multiple products", "Special weekend offers", "Order and delivery updates"],
  },
];

function getProductSizes(product) {
  if (Array.isArray(product.packSizes) && product.packSizes.length) {
    return product.packSizes.map((pack) => ({ label: pack.label, amount: 0, price: Number(pack.price) }));
  }
  const isMilk = product.category === "Cow Milk" || /milk/i.test(product.name);
  const choices = isMilk
    ? [{ label: "500 ml", amount: 500 }, { label: "1 L", amount: 1000 }, { label: "2 L", amount: 2000 }]
    : [{ label: "250 gm", amount: 250 }, { label: "500 gm", amount: 500 }, { label: "1 kg", amount: 1000 }];
  const match = product.detail.match(/(\d+(?:\.\d+)?)\s*(kg|g|ml|l|litre)\b/i);
  const baseAmount = match ? Number(match[1]) * (/^(kg|l|litre)$/i.test(match[2]) ? 1000 : 1) : 250;
  return choices.map((choice) => ({ ...choice, price: Math.max(1, Math.round((product.price * choice.amount) / baseAmount)) }));
}

function indiaDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const values = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return values.year + "-" + values.month + "-" + values.day;
}

function addDaysToDateKey(key, days) {
  const date = new Date(key + "T00:00:00Z");
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function dateKeyDifference(from, to) {
  return Math.round((Date.parse(to + "T00:00:00Z") - Date.parse(from + "T00:00:00Z")) / 86400000);
}

function estimateProductSubscription(product, sizeLabel, pattern, startDate, day1Quantity, day2Quantity) {
  const size = getProductSizes(product).find((option) => option.label === sizeLabel);
  if (!size || !startDate) return 0;
  const today = indiaDateKey();
  const end = addDaysToDateKey(today, 29);
  let total = 0;
  for (let date = startDate; date <= end; date = addDaysToDateKey(date, 1)) {
    const offset = dateKeyDifference(startDate, date);
    const quantity = pattern === "alternate" ? (offset % 2 === 0 ? day1Quantity : day2Quantity) : pattern === "weekly" ? (offset % 7 === 0 ? day1Quantity : 0) : day1Quantity;
    total += size.price * quantity;
  }
  return total;
}

function App() {
  const [products, setProducts] = useState(defaultProducts);
  const [categories, setCategories] = useState(categoryDefaults);
  const [activeCategory, setActiveCategory] = useState("All products");
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState({});
  const [showBasket, setShowBasket] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [selectedSize, setSelectedSize] = useState("");
  const [checkoutStep, setCheckoutStep] = useState("shop");
  const [customer, setCustomer] = useState({ name: "", phone: "", address: "", pin: "" });
  const [customerConsent, setCustomerConsent] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("upi");
  const [notice, setNotice] = useState("");
  const [orderSubmitting, setOrderSubmitting] = useState(false);
  const [accountSessionChecked, setAccountSessionChecked] = useState(false);
  const [checkoutAuthRequired, setCheckoutAuthRequired] = useState(false);
  const [checkoutAuthMode, setCheckoutAuthMode] = useState("register");
  const [checkoutUsername, setCheckoutUsername] = useState("");
  const [checkoutPassword, setCheckoutPassword] = useState("");
  const [checkoutConfirmPassword, setCheckoutConfirmPassword] = useState("");
  const [checkoutAuthBusy, setCheckoutAuthBusy] = useState(false);
  const [checkoutAuthError, setCheckoutAuthError] = useState("");
  const [subscriptionPage, setSubscriptionPage] = useState(() => {
    const requestedPage = new URLSearchParams(window.location.search).get("subscription");
    return requestedPage === "details" ? "details" : requestedPage === "plans" ? "plans" : "closed";
  });
  const [selectedPlan, setSelectedPlan] = useState(() => subscriptionPlans.find((plan) => plan.id === new URLSearchParams(window.location.search).get("plan")) || null);
  const [productSubscription, setProductSubscription] = useState(null);
  const [purchaseMode, setPurchaseMode] = useState("once");
  const [deliveryPattern, setDeliveryPattern] = useState("daily");
  const [subscriptionStartDate, setSubscriptionStartDate] = useState(() => indiaDateKey());
  const [day1Quantity, setDay1Quantity] = useState(1);
  const [day2Quantity, setDay2Quantity] = useState(0);
  const [showAccount, setShowAccount] = useState(() => window.location.pathname === "/customer" || new URLSearchParams(window.location.search).get("account") === "1");
  const [accountProfile, setAccountProfile] = useState(null);

  useEffect(() => {
    let current = true;
    const loadCatalog = () => {
      fetch("/api/products", { cache: "no-store" })
        .then((response) => response.ok ? response.json() : null)
        .then((result) => {
          if (!current || !Array.isArray(result?.products)) return;
          const nextProducts = result.products.map((product) => ({
            ...product,
            detail: product.detail || product.description || "",
            price: Number(product.price),
            id: Number(product.id),
          }));
          setProducts(nextProducts);
          const iconByCategory = Object.fromEntries(categoryDefaults.map((category) => [category.name, category.icon]));
          setCategories([{ name: "All products", icon: "✦" }, ...[...new Set(nextProducts.map((product) => product.category))].sort().map((name) => ({ name, icon: iconByCategory[name] || "✦" }))]);
        })
        .catch(() => {});
    };
    loadCatalog();
    const refreshTimer = window.setInterval(loadCatalog, 15000);
    window.addEventListener("focus", loadCatalog);
    return () => {
      current = false;
      window.clearInterval(refreshTimer);
      window.removeEventListener("focus", loadCatalog);
    };
  }, []);

  useEffect(() => {
    if (activeCategory !== "All products" && !products.some((product) => product.category === activeCategory)) {
      setActiveCategory("All products");
    }
  }, [activeCategory, products]);

  useEffect(() => {
    let current = true;
    fetch("/api/account/session", { credentials: "same-origin" })
      .then((response) => response.ok ? response.json() : null)
      .then((result) => {
        if (!current) return;
        const profile = result?.profile || null;
        setAccountProfile(profile);
        setAccountSessionChecked(true);
        if (profile) setCustomer((customer) => ({
          name: customer.name || profile.name || "",
          phone: customer.phone || profile.phone || "",
          address: customer.address || profile.address || "",
          pin: customer.pin || profile.pin || "",
        }));
      })
      .catch(() => { if (current) { setAccountProfile(null); setAccountSessionChecked(true); } });
    return () => { current = false; };
  }, []);

  const visibleProducts = useMemo(() => products.filter((product) => {
    const matchesCategory = activeCategory === "All products" || product.category === activeCategory;
    const matchesSearch = `${product.name} ${product.category} ${product.detail}`.toLowerCase().includes(search.toLowerCase());
    return matchesCategory && matchesSearch;
  }), [activeCategory, search, products]);

  const cartItems = Object.entries(cart).map(([key, item]) => ({
    key,
    ...item,
    product: products.find((product) => product.id === item.productId),
  })).filter((item) => item.product);
  const cartCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);
  const cartTotal = cartItems.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);

  const addToCart = (product, size, purchaseType = "once") => {
    const key = `${product.id}-${size.label}-${purchaseType}`;
    setCart((current) => ({
      ...current,
      [key]: {
        productId: product.id,
        size: size.label,
        unitPrice: size.price,
        purchaseType,
        quantity: (current[key]?.quantity || 0) + 1,
      },
    }));
    setSelectedProduct(null);
    setNotice(`${product.name} (${size.label}) added to your basket`);
    window.setTimeout(() => setNotice(""), 2200);
  };

  const changeQuantity = (key, change) => {
    setCart((current) => {
      const quantity = (current[key]?.quantity || 0) + change;
      const updated = { ...current };
      if (quantity <= 0) delete updated[key];
      else updated[key] = { ...updated[key], quantity };
      return updated;
    });
  };

  const updateCustomer = (event) => {
    const { name, value } = event.target;
    setCustomer((current) => ({ ...current, [name]: value }));
  };

  const submitOrder = async (orderType) => {
    if (orderSubmitting) return;
    setOrderSubmitting(true);
    setNotice("");
    const payload = {
      orderType,
      customer,
      consent: customerConsent,
      paymentMethod,
      ...(orderType === "subscription"
        ? productSubscription
          ? { productSubscription: {
              productId: productSubscription.productId,
              size: productSubscription.size,
              deliveryPattern: productSubscription.deliveryPattern,
              startDate: productSubscription.startDate,
              day1Quantity: productSubscription.day1Quantity,
              day2Quantity: productSubscription.day2Quantity,
            } }
          : { planId: selectedPlan?.id }
        : { items: cartItems.map((item) => ({ productId: item.productId, size: item.size, quantity: item.quantity, purchaseType: item.purchaseType })) }),
    };
    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "We could not save your request.");
      setNotice("Request #" + result.id + " saved. No payment has been taken.");
      setCart({});
      setCustomer({ name: "", phone: "", address: "", pin: "" });
      setCustomerConsent(false);
      setCheckoutStep("shop");
      setSubscriptionPage("closed");
      setProductSubscription(null);
      setSelectedPlan(null);
      if (orderType === "subscription" && accountProfile) {
        window.location.assign("/customer?subscription=updated");
        return;
      }
      window.history.replaceState({}, "", window.location.pathname);
      window.scrollTo(0, 0);
      window.setTimeout(() => setNotice(""), 6000);
    } catch (error) {
      setNotice(error.message || "We could not save your request. Please try again.");
    } finally {
      setOrderSubmitting(false);
    }
  };

  const continueCheckoutAuth = async (event) => {
    event.preventDefault();
    setCheckoutAuthBusy(true);
    setCheckoutAuthError("");
    if (checkoutAuthMode === "register" && checkoutPassword !== checkoutConfirmPassword) {
      setCheckoutAuthError("The passwords do not match.");
      setCheckoutAuthBusy(false);
      return;
    }
    try {
      const response = await fetch(checkoutAuthMode === "register" ? "/api/auth/register" : "/api/auth/login", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: checkoutUsername.trim(), password: checkoutPassword }),
      });
      let result = {};
      try { result = await response.json(); } catch { result = {}; }
      if (!response.ok) throw new Error(result.error || "We couldn’t complete that request. Please try again.");

      const sessionResponse = await fetch("/api/account/session", { credentials: "same-origin" });
      const session = sessionResponse.ok ? await sessionResponse.json() : null;
      const profile = session?.profile || null;
      if (!profile) throw new Error("Your account was created, but we couldn’t load your session. Please sign in to continue.");
      setAccountProfile(profile);
      setAccountSessionChecked(true);
      setCustomer((current) => ({
        name: current.name || profile.name || "",
        phone: current.phone || profile.phone || "",
        address: current.address || profile.address || "",
        pin: current.pin || profile.pin || "",
      }));
      if (subscriptionPage === "account") {
        setSubscriptionPage("payment");
      } else {
        setCheckoutAuthRequired(false);
        setCheckoutStep("payment");
      }
      window.scrollTo(0, 0);
    } catch (error) {
      setCheckoutAuthError(error.message || "We couldn’t complete that request. Please try again.");
    } finally {
      setCheckoutAuthBusy(false);
    }
  };

  const openSizePicker = (product) => {
    setSelectedProduct(product);
    setSelectedSize(getProductSizes(product)[0].label);
    setPurchaseMode("once");
    setDeliveryPattern("daily");
    setSubscriptionStartDate(indiaDateKey());
    setDay1Quantity(1);
    setDay2Quantity(0);
  };

  const productSubscriptionEstimate = selectedProduct
    ? estimateProductSubscription(selectedProduct, selectedSize, deliveryPattern, subscriptionStartDate, Number(day1Quantity) || 0, Number(day2Quantity) || 0)
    : 0;

  const beginProductSubscription = () => {
    if (!selectedProduct) return;
    setProductSubscription({
      productId: selectedProduct.id,
      size: selectedSize,
      deliveryPattern,
      startDate: subscriptionStartDate,
      day1Quantity: Number(day1Quantity),
      day2Quantity: deliveryPattern === "alternate" ? Number(day2Quantity) : 0,
      estimatedTotal: productSubscriptionEstimate,
    });
    setSelectedPlan(null);
    setSelectedProduct(null);
    setSubscriptionPage("details");
    window.scrollTo(0, 0);
  };

  if (showAccount) return <CustomerAccount onBack={() => setShowAccount(false)} />;

  if (subscriptionPage !== "closed") {
    return (
      <div className="subscription-page">
        <header className="subscription-header">
          <a className="logo" href="#home" onClick={(event) => { event.preventDefault(); setSubscriptionPage("closed"); }}>
            <img className="logo-mark" src="/royal-hill-mark.svg" alt="" /><span>Royal Hill <b>Dairy</b></span>
          </a>
          <button className="checkout-back" onClick={() => {
            if (subscriptionPage === "payment") setSubscriptionPage("details");
            else if (subscriptionPage === "account") setSubscriptionPage("details");
            else if (subscriptionPage === "details") setSubscriptionPage(productSubscription ? "closed" : "plans");
            else setSubscriptionPage("closed");
          }}>
            ← {subscriptionPage === "payment" || subscriptionPage === "account" ? "Back to details" : subscriptionPage === "details" ? (productSubscription ? "Back to shop" : "Back to plans") : "Back to shop"}
          </button>
        </header>

        {subscriptionPage === "plans" ? (
          <main className="subscription-content">
            <p className="eyebrow">FRESHNESS ON YOUR SCHEDULE</p>
            <h1>Choose your subscription</h1>
            <p className="subscription-intro">Select a 30-day plan. You’ll go straight to payment after choosing.</p>
            <div className="subscription-plans">
              {subscriptionPlans.map((plan) => (
                <article className={`subscription-plan ${plan.id === "fresh-plus" ? "featured" : ""}`} key={plan.id}>
                  {plan.id === "fresh-plus" && <span className="plan-ribbon">MORE BENEFITS</span>}
                  <div className="plan-icon">{plan.icon}</div>
                  <h2>{plan.name}</h2>
                  <div className="plan-price">₹{plan.price}<span> / {plan.period}</span></div>
                  <p>{plan.description}</p>
                  <ul>{plan.features.map((feature) => <li key={feature}>✓ &nbsp;{feature}</li>)}</ul>
                  <button className="checkout-primary" onClick={() => { setProductSubscription(null); setSelectedPlan(plan); setSubscriptionPage("details"); window.scrollTo(0, 0); }}>
                    Proceed to payment <span>→</span>
                  </button>
                </article>
              ))}
            </div>
          </main>
        ) : subscriptionPage === "details" ? (
          <main className="subscription-content subscription-payment-page">
            <p className="eyebrow">DELIVERY DETAILS</p>
            <h1>Where should we deliver?</h1>
            <p className="subscription-intro">Add your contact and address details for this subscription request.</p>
            {productSubscription && (
              <div className="subscription-config-summary">
                <strong>{products.find((product) => product.id === productSubscription.productId)?.name} · {productSubscription.size}</strong>
                <span>{productSubscription.deliveryPattern === "alternate" ? "Alternate-day" : productSubscription.deliveryPattern === "weekly" ? "Weekly" : "Daily"} delivery, starting {new Date(productSubscription.startDate + "T00:00:00").toLocaleDateString()} · Day 1 quantity {productSubscription.day1Quantity}{productSubscription.deliveryPattern === "alternate" ? " · Day 2 quantity " + productSubscription.day2Quantity : ""}</span>
                <b>Estimated 30-day total: ₹{productSubscription.estimatedTotal}</b>
              </div>
            )}
            <form className="checkout-form subscription-details-form" onSubmit={(event) => { event.preventDefault(); setSubscriptionPage(accountProfile ? "payment" : "account"); window.scrollTo(0, 0); }}>
              <label>Full name<input name="name" value={customer.name} onChange={updateCustomer} placeholder="Your name" autoComplete="name" required /></label>
              <label>Phone number<input name="phone" type="tel" inputMode="numeric" pattern="[0-9]{10}" maxLength="10" value={customer.phone} onChange={updateCustomer} placeholder="10-digit mobile number" autoComplete="tel" required /></label>
              <label className="full-field">Delivery address<textarea name="address" rows="3" value={customer.address} onChange={updateCustomer} placeholder="House / flat, street, area" autoComplete="street-address" required /></label>
              <label>PIN code<input name="pin" inputMode="numeric" pattern="[0-9]{6}" maxLength="6" value={customer.pin} onChange={updateCustomer} placeholder="6-digit PIN code" autoComplete="postal-code" required /></label>
              <label className="full-field consent-row"><input type="checkbox" checked={customerConsent} onChange={(event) => setCustomerConsent(event.target.checked)} required /><span>I agree to send these details to Royal Hill Dairy to handle my order request.</span></label>
              <button className="checkout-primary full-field" type="submit" disabled={!accountSessionChecked}>{!accountSessionChecked ? "Checking account…" : accountProfile ? "Continue to payment" : "Continue to account"} <span>→</span></button>
            </form>
          </main>
        ) : subscriptionPage === "account" ? (
          <main className="subscription-content subscription-payment-page">
            <p className="eyebrow">YOUR ROYAL HILL ACCOUNT</p>
            <h1>{checkoutAuthMode === "register" ? "Create your account" : "Sign in to continue"}</h1>
            <p className="subscription-intro">A customer account lets you manage your delivery schedule and view your subscription history.</p>
            <div className="checkout-auth-switch" role="group" aria-label="Choose account action">
              <button type="button" className={checkoutAuthMode === "register" ? "active" : ""} onClick={() => { setCheckoutAuthMode("register"); setCheckoutAuthError(""); }}>Create account</button>
              <button type="button" className={checkoutAuthMode === "login" ? "active" : ""} onClick={() => { setCheckoutAuthMode("login"); setCheckoutAuthError(""); }}>Sign in</button>
            </div>
            <form className="checkout-auth-form subscription-account-form" onSubmit={continueCheckoutAuth}>
              <label>Username<input name="username" autoComplete="username" autoCapitalize="none" maxLength="32" value={checkoutUsername} onChange={(event) => setCheckoutUsername(event.target.value)} placeholder="Choose a unique username" required /></label>
              <label>Password<input name="password" type="password" autoComplete={checkoutAuthMode === "register" ? "new-password" : "current-password"} minLength="8" maxLength="128" value={checkoutPassword} onChange={(event) => setCheckoutPassword(event.target.value)} placeholder="At least 8 characters" required /></label>
              {checkoutAuthMode === "register" && <label>Confirm password<input name="confirmPassword" type="password" autoComplete="new-password" minLength="8" maxLength="128" value={checkoutConfirmPassword} onChange={(event) => setCheckoutConfirmPassword(event.target.value)} placeholder="Enter your password again" required /></label>}
              {checkoutAuthError && <p className="checkout-auth-error" role="alert">{checkoutAuthError}</p>}
              <button className="checkout-primary" type="submit" disabled={checkoutAuthBusy}>{checkoutAuthBusy ? "Please wait…" : checkoutAuthMode === "register" ? "Create account and continue" : "Sign in and continue"} <span>→</span></button>
            </form>
          </main>
        ) : (
          <main className="subscription-content subscription-payment-page">
            <p className="eyebrow">SUBSCRIPTION CHECKOUT</p>
            <h1>Select a payment method</h1>
            <p className="subscription-intro">{productSubscription ? "Review the recurring delivery details for this product." : "Your selected plan is ready for payment."}</p>
            <div className="subscription-payment-layout">
              <section className="subscription-payment-card">
                <div className="selected-plan-summary">
                  <span className="plan-icon">{productSubscription ? products.find((product) => product.id === productSubscription.productId)?.icon : selectedPlan?.icon}</span>
                  <div>
                    <strong>{productSubscription ? products.find((product) => product.id === productSubscription.productId)?.name : selectedPlan?.name}</strong>
                    <small>{productSubscription ? (productSubscription.deliveryPattern === "alternate" ? "Alternate-day" : productSubscription.deliveryPattern === "weekly" ? "Weekly" : "Daily") + " · " + productSubscription.size + " · starts " + productSubscription.startDate : selectedPlan?.period + " subscription"}</small>
                  </div>
                  <b>₹{productSubscription ? productSubscription.estimatedTotal : selectedPlan?.price}</b>
                </div>
                <div className="payment-group-label">PAYMENT METHODS</div>
                <div className="payment-options">
                  {paymentOptions.map((option) => (
                    <button type="button" key={option.id} className={`payment-option ${paymentMethod === option.id ? "selected" : ""}`} onClick={() => setPaymentMethod(option.id)}>
                      <span className="payment-icon">{option.icon}</span>
                      <span className="payment-copy"><strong>{option.title}</strong><small>{option.detail}</small></span>
                      <span className="payment-radio">{paymentMethod === option.id && <i />}</span>
                    </button>
                  ))}
                </div>
                <button className="checkout-primary subscription-pay-button" disabled={orderSubmitting} onClick={() => submitOrder("subscription")}>
                  {orderSubmitting ? "Saving request…" : "Save subscription request · ₹" + (productSubscription ? productSubscription.estimatedTotal : selectedPlan?.price)} <span>→</span>
                </button>
                <p className="payment-demo-note">This saves your request for the dairy team. No payment is taken and delivery is not yet confirmed.</p>
              </section>
            </div>
          </main>
        )}
        {notice && <div className="toast" role="status">✓ &nbsp;{notice}</div>}
      </div>
    );
  }

  if (checkoutStep !== "shop") {
    return (
      <div className="checkout-page">
        <header className="checkout-topbar">
          <a className="logo" href="#home" onClick={(event) => { event.preventDefault(); setCheckoutStep("shop"); }}>
            <img className="logo-mark" src="/royal-hill-mark.svg" alt="" /><span>Royal Hill <b>Dairy</b></span>
          </a>
          <button className="checkout-back" onClick={() => {
            if (checkoutAuthRequired) setCheckoutAuthRequired(false);
            else setCheckoutStep(checkoutStep === "payment" ? "details" : "shop");
          }}>
            ← {checkoutAuthRequired ? "Back to details" : checkoutStep === "payment" ? "Back to details" : "Back to shop"}
          </button>
        </header>

        <main className="checkout-layout">
          <section className="checkout-main-card">
            <div className="checkout-steps">
              <span className={checkoutAuthRequired || checkoutStep === "payment" ? "done" : checkoutStep === "details" ? "current" : ""}>1&nbsp; Delivery details</span>
              <i />
              <span className={checkoutAuthRequired ? "current" : accountProfile || checkoutStep === "payment" ? "done" : ""}>2&nbsp; Account</span>
              <i />
              <span className={checkoutStep === "payment" ? "current" : ""}>3&nbsp; Payment</span>
            </div>

            {checkoutStep === "details" && !checkoutAuthRequired ? (
              <>
                <p className="eyebrow">ALMOST THERE</p>
                <h1>Where should we deliver?</h1>
                <p className="checkout-intro">Add your contact and address details for delivery.</p>
                <form className="checkout-form" onSubmit={(event) => {
                  event.preventDefault();
                  if (!accountSessionChecked) return;
                  if (accountProfile) {
                    setCheckoutStep("payment");
                    window.scrollTo(0, 0);
                  } else {
                    setCheckoutAuthRequired(true);
                    setCheckoutAuthMode("register");
                    setCheckoutAuthError("");
                    window.scrollTo(0, 0);
                  }
                }}>
                  <label>Full name<input name="name" value={customer.name} onChange={updateCustomer} placeholder="Your name" autoComplete="name" required /></label>
                  <label>Phone number<input name="phone" type="tel" inputMode="numeric" pattern="[0-9]{10}" maxLength="10" value={customer.phone} onChange={updateCustomer} placeholder="10-digit mobile number" autoComplete="tel" required /></label>
                  <label className="full-field">Delivery address<textarea name="address" rows="3" value={customer.address} onChange={updateCustomer} placeholder="House / flat, street, area" autoComplete="street-address" required /></label>
                  <label>PIN code<input name="pin" inputMode="numeric" pattern="[0-9]{6}" maxLength="6" value={customer.pin} onChange={updateCustomer} placeholder="6-digit PIN code" autoComplete="postal-code" required /></label>
                  <label className="full-field consent-row"><input type="checkbox" checked={customerConsent} onChange={(event) => setCustomerConsent(event.target.checked)} required /><span>I agree to send these details to Royal Hill Dairy to handle my order request.</span></label>
                  <button className="checkout-primary full-field" type="submit" disabled={!accountSessionChecked}>
                    {!accountSessionChecked ? "Checking account…" : accountProfile ? "Proceed to payment" : "Continue to create account"} <span>→</span>
                  </button>
                </form>
              </>
            ) : checkoutAuthRequired ? (
              <section className="checkout-register-panel">
                <p className="eyebrow">{checkoutAuthMode === "register" ? "YOUR FIRST ORDER" : "WELCOME BACK"}</p>
                <h1>{checkoutAuthMode === "register" ? "Create your account" : "Sign in to continue"}</h1>
                <p className="checkout-intro">
                  {checkoutAuthMode === "register"
                    ? "Create a Royal Hill account to continue to payment and keep your orders together."
                    : "Sign in to continue to payment with your Royal Hill account."}
                </p>
                <div className="checkout-auth-switch" role="group" aria-label="Choose account action">
                  <button type="button" className={checkoutAuthMode === "register" ? "active" : ""} onClick={() => { setCheckoutAuthMode("register"); setCheckoutAuthError(""); }}>Create account</button>
                  <button type="button" className={checkoutAuthMode === "login" ? "active" : ""} onClick={() => { setCheckoutAuthMode("login"); setCheckoutAuthError(""); }}>Sign in</button>
                </div>
                <form className="checkout-auth-form" onSubmit={continueCheckoutAuth}>
                  <label>Username
                    <input name="username" autoComplete="username" autoCapitalize="none" maxLength="32" value={checkoutUsername} onChange={(event) => setCheckoutUsername(event.target.value)} placeholder="Choose a unique username" required />
                  </label>
                  <label>Password
                    <input name="password" type="password" autoComplete={checkoutAuthMode === "register" ? "new-password" : "current-password"} minLength="8" maxLength="128" value={checkoutPassword} onChange={(event) => setCheckoutPassword(event.target.value)} placeholder="At least 8 characters" required />
                  </label>
                  {checkoutAuthMode === "register" && (
                    <label>Confirm password
                      <input name="confirmPassword" type="password" autoComplete="new-password" minLength="8" maxLength="128" value={checkoutConfirmPassword} onChange={(event) => setCheckoutConfirmPassword(event.target.value)} placeholder="Enter your password again" required />
                    </label>
                  )}
                  {checkoutAuthError && <p className="checkout-auth-error" role="alert">{checkoutAuthError}</p>}
                  <button className="checkout-primary" type="submit" disabled={checkoutAuthBusy}>
                    {checkoutAuthBusy ? "Please wait…" : checkoutAuthMode === "register" ? "Create account and continue" : "Sign in and continue"} <span>→</span>
                  </button>
                </form>
                <p className="checkout-auth-note">Your delivery details stay ready while you create an account or sign in.</p>
              </section>
            ) : (
              <>
                <p className="eyebrow">SAFE & SIMPLE CHECKOUT</p>
                <h1>Select a payment method</h1>
                <p className="checkout-intro">Choose how you would like to pay for your order.</p>
                <div className="payment-group-label">PAYMENT METHODS</div>
                <div className="payment-options">
                  {paymentOptions.map((option) => (
                    <button type="button" key={option.id} className={`payment-option ${paymentMethod === option.id ? "selected" : ""}`} onClick={() => setPaymentMethod(option.id)}>
                      <span className="payment-icon">{option.icon}</span>
                      <span className="payment-copy"><strong>{option.title}</strong><small>{option.detail}</small></span>
                      <span className="payment-radio">{paymentMethod === option.id && <i />}</span>
                    </button>
                  ))}
                </div>
                <div className="delivery-summary"><span>Delivering to</span><strong>{customer.name} · {customer.phone}</strong><p>{customer.address}, PIN {customer.pin}</p></div>
                <button className="checkout-primary payment-submit" disabled={orderSubmitting} onClick={() => submitOrder("product")}>
                  {orderSubmitting ? "Saving request…" : "Save order request · ₹" + cartTotal} <span>→</span>
                </button>
                <p className="payment-demo-note">This saves your request for the dairy team. No payment is taken and delivery is not yet confirmed.</p>
              </>
            )}
          </section>

          <aside className="order-summary">
            <h2>Order summary</h2>
            <div className="summary-products">
              {cartItems.map((item) => (
                <div className="summary-product" key={item.key}>
                  <span>{item.product.icon}</span>
                  <div><strong>{item.product.name}</strong><small>{item.purchaseType === "trial" ? "Trial delivery · " : ""}{item.size} · Qty {item.quantity}</small></div>
                  <b>₹{item.unitPrice * item.quantity}</b>
                </div>
              ))}
            </div>
            <div className="summary-total"><span>Total</span><strong>₹{cartTotal}</strong></div>
            <p className="summary-fresh">✿ &nbsp;Freshness made close to home</p>
          </aside>
        </main>
        {notice && <div className="toast" role="status">✓ &nbsp;{notice}</div>}
      </div>
    );
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <a className="logo" href="#home" aria-label="Royal Hill Dairy home">
          <img className="logo-mark" src="/royal-hill-mark.svg" alt="" /><span>Royal Hill <b>Dairy</b></span>
        </a>
        <div className="sidebar-label">SHOP BY CATEGORY</div>
        <nav className="category-nav" aria-label="Product categories">
          {categories.map((category) => (
            <button key={category.name} className={`nav-item ${activeCategory === category.name ? "active" : ""}`} onClick={() => setActiveCategory(category.name)}>
              <span className="nav-icon">{category.icon}</span>{category.name}
              {category.name === "All products" && <span className="nav-arrow">›</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-note"><span className="note-icon">☀</span><strong>Fresh from our farm</strong><p>Made with care, delivered with love.</p></div>
        <div className="sidebar-bottom">GOODNESS IN EVERY DROP <span>♥</span></div>
      </aside>

      <main className="main" id="home">
        <header className="topbar">
          <div className="search-box">
            <span aria-hidden="true">⌕</span>
            <input aria-label="Search products" placeholder="Search milk, paneer, sweets..." value={search} onChange={(event) => setSearch(event.target.value)} />
            {search && <button className="clear-search" onClick={() => setSearch("")} aria-label="Clear search">×</button>}
          </div>
          <div className="topbar-actions">
            <button className="basket-button" onClick={() => setShowBasket(true)}>
              <svg className="basket-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="M3.5 9h17l-1.4 9.5H5L3.5 9Z"/><path d="m8 9 3-5M16 9l-3-5M7.2 13.2v2.1M12 13.2v2.1M16.8 13.2v2.1"/></svg><span className="basket-text">Basket</span>{cartCount > 0 && <span className="basket-count">{cartCount}</span>}
            </button>
            <button className="subscription-button" onClick={() => setSubscriptionPage("plans")}>
              <span>✦</span><span className="subscription-button-text">Subscription</span>
            </button>
            <button className="account-entry-button" aria-label={accountProfile ? "Open your account" : "Sign in or create an account"} onClick={() => setShowAccount(true)}>{accountProfile ? "@" + accountProfile.username : "Login / Account"}</button>
          </div>
        </header>

        <section className="hero" aria-label="Royal Hill Dairy shop cover">
          <img className="shop-photo" src="/images/royal.webp" alt="Royal Hill Dairy shop and products" />
        </section>

        <section className="promise-strip" aria-label="Our promise">
          <div><span>☀</span><strong>Fresh every morning</strong></div><i />
          <div><span>♡</span><strong>Made with care</strong></div><i />
          <div><span>♧</span><strong>Goodness you can trust</strong></div>
        </section>

        <section className="section" id="products">
          <div className="section-heading">
            <div><p className="eyebrow">FROM OUR DAIRY TO YOUR TABLE</p><h2>{activeCategory === "All products" ? "Our fresh picks" : activeCategory}</h2></div>
            <span className="product-count">{visibleProducts.length} {visibleProducts.length === 1 ? "product" : "products"}</span>
          </div>
          {visibleProducts.length ? (
            <div className="product-grid" key={activeCategory}>
              {visibleProducts.map((product) => (
                <article className="product-card" key={product.id}>
                  <div className={`product-cover ${product.color}`}>
                    <span className="cover-sparkle sparkle-one">✦</span><span className="cover-sparkle sparkle-two">✧</span>
                    <div className="brand-stamp"><span>ROYAL HILL</span><small>FARM FRESH</small></div>
                    <div className="product-art" aria-hidden="true">{product.icon}</div>
                    <div className="cover-caption">{product.tag}</div><span className="cover-seal">✿</span>
                  </div>
                  <div className="product-info">
                    <div className="product-name-row"><h3>{product.name}</h3><span className="price">₹{product.price}</span></div>
                    <p>{product.detail}</p>
                    <button className="add-button" onClick={() => openSizePicker(product)}><span>＋</span> Choose size</button>
                  </div>
                </article>
              ))}
            </div>
          ) : <div className="empty-state"><span>🥛</span><h3>No products found</h3><p>Try another search or choose a different category.</p></div>}
        </section>
        <footer className="footer"><span>✿</span> Royal Hill Dairy <i>•</i> Freshness made close to home</footer>
      </main>

      {showBasket && (
        <div className="basket-backdrop" onClick={() => setShowBasket(false)}>
          <aside className="basket-drawer" onClick={(event) => event.stopPropagation()} aria-label="Shopping basket">
            <div className="basket-heading"><div><h2>Your basket</h2><p>{cartCount} {cartCount === 1 ? "item" : "items"}</p></div><button onClick={() => setShowBasket(false)} aria-label="Close basket">×</button></div>
            {cartItems.length === 0 ? <p className="basket-empty">Your basket is empty. Add a fresh favourite!</p> : (
              <>
                <div className="basket-items">
                  {cartItems.map((item) => (
                    <div className="basket-item" key={item.key}>
                      <span className="basket-product-icon">{item.product.icon}</span>
                      <div className="basket-product-info"><strong>{item.product.name}</strong><span>{item.purchaseType === "trial" ? "Trial · one delivery" : "Buy once"} · {item.size} · ₹{item.unitPrice}</span></div>
                      <div className="quantity-control"><button onClick={() => changeQuantity(item.key, -1)} aria-label="Remove one">−</button><span>{item.quantity}</span><button onClick={() => changeQuantity(item.key, 1)} aria-label={item.quantity >= 99 ? "Maximum quantity reached" : "Add one"} disabled={item.quantity >= 99} title={item.quantity >= 99 ? "Maximum 99 per item" : undefined}>+</button></div>
                    </div>
                  ))}
                </div>
                <div className="basket-total"><span>Total</span><strong>₹{cartTotal}</strong></div>
                <button className="checkout-primary basket-checkout" onClick={() => { setShowBasket(false); setCheckoutStep("details"); window.scrollTo(0, 0); }}>Continue to checkout <span>→</span></button>
              </>
            )}
          </aside>
        </div>
      )}

      {selectedProduct && (
        <div className="size-modal-backdrop" onClick={() => setSelectedProduct(null)}>
          <section className="size-modal" role="dialog" aria-modal="true" aria-labelledby="size-modal-title" onClick={(event) => event.stopPropagation()}>
            <button className="size-modal-close" onClick={() => setSelectedProduct(null)} aria-label="Close">×</button>
            <div className="size-modal-icon">{selectedProduct.icon}</div>
            <p className="eyebrow">CHOOSE SIZE AND DELIVERY TYPE</p>
            <h2 id="size-modal-title">{selectedProduct.name}</h2>
            <div className="size-options">
              {getProductSizes(selectedProduct).map((size) => (
                <label className={`size-option ${selectedSize === size.label ? "chosen" : ""}`} key={size.label}>
                  <input type="radio" name="product-size" value={size.label} checked={selectedSize === size.label} onChange={() => setSelectedSize(size.label)} />
                  <span className="size-option-text"><strong>{size.label}</strong><small>₹{size.price}</small></span>
                </label>
              ))}
            </div>
            <div className="purchase-mode-picker" role="group" aria-label="Choose purchase type">
              {[["once", "Buy once"], ["trial", "Trial"], ["subscribe", "Subscribe"]].map(([mode, label]) => (
                <button type="button" key={mode} className={purchaseMode === mode ? "active" : ""} onClick={() => setPurchaseMode(mode)}>{label}</button>
              ))}
            </div>
            {purchaseMode === "trial" && <p className="purchase-mode-note">One standard-price delivery only. It will not repeat.</p>}
            {purchaseMode === "subscribe" && (
              <div className="product-subscription-controls">
                <p className="product-subscription-title">Delivery pattern · 30 days from purchase</p>
                <div className="delivery-pattern-options" role="group" aria-label="Delivery pattern">
                  {[["daily", "Daily"], ["alternate", "Alternate day"], ["weekly", "Weekly"]].map(([pattern, label]) => (
                    <button type="button" key={pattern} className={deliveryPattern === pattern ? "active" : ""} onClick={() => setDeliveryPattern(pattern)}>{label}</button>
                  ))}
                </div>
                <label className="subscription-start-date">First delivery date
                  <input type="date" min={indiaDateKey()} max={addDaysToDateKey(indiaDateKey(), 29)} value={subscriptionStartDate} onChange={(event) => setSubscriptionStartDate(event.target.value)} />
                </label>
                <div className="subscription-quantity-fields">
                  <label>Day 1 quantity
                    <input type="number" min="1" max="99" value={day1Quantity} onChange={(event) => setDay1Quantity(event.target.value)} />
                  </label>
                  {deliveryPattern === "alternate" && <label>Day 2 quantity
                    <input type="number" min="0" max="99" value={day2Quantity} onChange={(event) => setDay2Quantity(event.target.value)} />
                  </label>}
                </div>
                <p className="subscription-estimate">Estimated 30-day schedule total: <strong>₹{productSubscriptionEstimate}</strong></p>
                <small className="purchase-mode-note">Delivery dates and quantities can be managed in your customer account. No online payment is taken.</small>
              </div>
            )}
            <button className="checkout-primary size-add-button" disabled={purchaseMode === "subscribe" && (!subscriptionStartDate || Number(day1Quantity) < 1 || Number(day1Quantity) > 99 || (deliveryPattern === "alternate" && (Number(day2Quantity) < 0 || Number(day2Quantity) > 99)))} onClick={() => {
              const size = getProductSizes(selectedProduct).find((option) => option.label === selectedSize);
              if (!size) return;
              if (purchaseMode === "subscribe") beginProductSubscription();
              else addToCart(selectedProduct, size, purchaseMode === "trial" ? "trial" : "once");
            }}>{purchaseMode === "subscribe" ? "Continue to subscription" : purchaseMode === "trial" ? "Add trial delivery" : "Add to basket"} <span>→</span></button>
          </section>
        </div>
      )}
      {notice && <div className="toast" role="status">✓ &nbsp;{notice}</div>}
    </div>
  );
}

export default App;
