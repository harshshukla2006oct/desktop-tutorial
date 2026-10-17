import React, { useCallback, useEffect, useState } from "react";
import "./AdminDashboard.css";

const pageSize = 50;
const adminProducts = [
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
const adminPlans = [
  { id: "daily-milk", name: "Daily Cow Milk" },
  { id: "fresh-plus", name: "Fresh Plus" },
];
const paymentMethods = ["upi", "card", "emi", "netbanking", "cod"];
const sizesForProduct = (productId, catalog = adminProducts) => {
  const product = catalog.find((candidate) => Number(candidate.id) === Number(productId));
  return product?.milk || product?.is_milk || [1, 2].includes(Number(productId)) ? ["500 ml", "1 L", "2 L"] : ["250 gm", "500 gm", "1 kg"];
};
const emptyOrderDraft = () => ({
  customerName: "", phone: "", address: "", pin: "",
  orderType: "product", paymentMethod: "cod", consent: false,
  planId: "daily-milk", items: [{ productId: "1", size: "1 L", quantity: 1 }],
});

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
  const [catalogProducts, setCatalogProducts] = useState(adminProducts);
  const [productSearch, setProductSearch] = useState("");
  const [productCategory, setProductCategory] = useState("All categories");
  const [productFormOpen, setProductFormOpen] = useState(false);
  const [editingProductId, setEditingProductId] = useState(null);
  const [productDraft, setProductDraft] = useState({ name: "", category: "", detail: "", icon: "✦", tag: "", packSizes: [{ label: "1 pack", price: "" }], inStock: true });
  const [productSaving, setProductSaving] = useState(false);
  const [productError, setProductError] = useState("");
  const [entries, setEntries] = useState([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loginCustomers, setLoginCustomers] = useState([]);
  const [recentLogins, setRecentLogins] = useState([]);
  const [loginOffset, setLoginOffset] = useState(0);
  const [loginCustomersTotal, setLoginCustomersTotal] = useState(0);
  const [registeredCustomers, setRegisteredCustomers] = useState(0);
  const [customersLoggedIn, setCustomersLoggedIn] = useState(0);
  const [totalLogins, setTotalLogins] = useState(0);
  const [activeSection, setActiveSection] = useState("orders");
  const [dataLogs, setDataLogs] = useState([]);
  const [dataLogsTotal, setDataLogsTotal] = useState(0);
  const [dataLogsOffset, setDataLogsOffset] = useState(0);
  const [orderFormOpen, setOrderFormOpen] = useState(false);
  const [editingOrderId, setEditingOrderId] = useState(null);
  const [orderDraft, setOrderDraft] = useState(emptyOrderDraft);
  const [orderSaving, setOrderSaving] = useState(false);
  const [orderError, setOrderError] = useState("");

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

  const loadLoginCustomers = useCallback(async (nextOffset = 0) => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/customer-logins?limit=" + pageSize + "&offset=" + nextOffset);
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not load customer login activity.");
      setLoginCustomers(result.customers || []);
      setRecentLogins(result.recentLogins || []);
      setLoginCustomersTotal(result.loggedInCustomers || 0);
      setRegisteredCustomers(result.registeredCustomers || 0);
      setCustomersLoggedIn(result.loggedInCustomers || 0);
      setTotalLogins(result.totalLogins || 0);
      setLoginOffset(nextOffset);
    } catch (loadError) {
      setError(loadError.message || "Could not load customer login activity.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadProducts = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/products");
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not load products.");
      setCatalogProducts(result.products || []);
    } catch (loadError) {
      setError(loadError.message || "Could not load products.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDataLogs = useCallback(async (nextOffset = 0) => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/data-logs?limit=" + pageSize + "&offset=" + nextOffset);
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not load data logs.");
      setDataLogs(result.entries || []);
      setDataLogsTotal(result.total || 0);
      setDataLogsOffset(nextOffset);
    } catch (loadError) {
      setError(loadError.message || "Could not load data logs.");
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshDashboard = useCallback(
    () => Promise.all([loadEntries(0), loadLoginCustomers(0), loadDataLogs(0), loadProducts()]),
    [loadEntries, loadLoginCustomers, loadDataLogs, loadProducts],
  );

  useEffect(() => {
    fetch("/api/admin/session")
      .then((response) => {
        if (response.ok) {
          setAuthState("authenticated");
          refreshDashboard();
        } else {
          setAuthState("signed-out");
        }
      })
      .catch(() => {
        setAuthState("signed-out");
        setError("Dashboard service is unavailable. Please try again.");
      });
  }, [refreshDashboard]);

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
      await refreshDashboard();
    } catch (loginError) {
      setError(loginError.message || "Sign-in failed.");
    } finally {
      setLoading(false);
    }
  };

  const signOut = async () => {
    await fetch("/api/admin/logout", { method: "POST" }).catch(() => {});
    setEntries([]);
    setLoginCustomers([]);
    setRecentLogins([]);
    setAuthState("signed-out");
  };

  const startCreateOrder = () => {
    setEditingOrderId(null);
    setOrderDraft(emptyOrderDraft());
    setOrderError("");
    setOrderFormOpen(true);
  };

  const startEditOrder = (entry) => {
    setEditingOrderId(entry.id);
    const isSubscription = entry.order_type === "subscription";
    const firstItem = entry.items?.[0];
    const plan = adminPlans.find((candidate) => candidate.name === firstItem?.name);
    const items = (entry.items || []).map((item) => {
      const product = catalogProducts.find((candidate) => candidate.name === item.name);
      const productId = product?.id || 1;
      const sizes = sizesForProduct(productId, catalogProducts);
      return {
        productId: String(productId),
        size: sizes.includes(item.size) ? item.size : sizes[0],
        quantity: Number(item.quantity) || 1,
      };
    });
    setOrderDraft({
      customerName: entry.customer_name || "",
      phone: entry.phone?.trim() || "",
      address: entry.delivery_address || "",
      pin: entry.postal_code?.trim() || "",
      orderType: isSubscription ? "subscription" : "product",
      paymentMethod: entry.payment_method || "cod",
      consent: false,
      planId: plan?.id || "daily-milk",
      items: items.length ? items : [{ productId: "1", size: "1 L", quantity: 1 }],
    });
    setOrderError("");
    setOrderFormOpen(true);
  };

  const startCreateProduct = () => {
    setEditingProductId(null);
    setProductDraft({ name: "", category: "", detail: "", icon: "✦", tag: "", packSizes: [{ label: "1 pack", price: "" }], inStock: true });
    setProductError("");
    setProductFormOpen(true);
  };

  const startEditProduct = (product) => {
    setEditingProductId(product.id);
    setProductDraft({ name: product.name, category: product.category, detail: product.detail, icon: product.icon || "✦", tag: product.tag || "", packSizes: (product.packSizes || []).map((pack) => ({ label: pack.label, price: String(pack.price) })), inStock: product.inStock !== false });
    setProductError("");
    setProductFormOpen(true);
  };

  const updateProductPack = (index, field, value) => {
    setProductDraft((draft) => ({
      ...draft,
      packSizes: draft.packSizes.map((pack, packIndex) => packIndex === index ? { ...pack, [field]: value } : pack),
    }));
  };

  const addProductPack = () => {
    setProductDraft((draft) => ({ ...draft, packSizes: [...draft.packSizes, { label: "", price: "" }] }));
  };

  const removeProductPack = (index) => {
    setProductDraft((draft) => ({ ...draft, packSizes: draft.packSizes.filter((_, packIndex) => packIndex !== index) }));
  };

  const saveProduct = async (event) => {
    event.preventDefault();
    setProductSaving(true);
    setProductError("");
    try {
      const response = await fetch(editingProductId ? "/api/admin/products/" + editingProductId : "/api/admin/products", {
        method: editingProductId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...productDraft, price: Number(productDraft.packSizes[0]?.price), packSizes: productDraft.packSizes.map((pack) => ({ label: pack.label, price: Number(pack.price) })), inStock: productDraft.inStock }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "The product could not be saved.");
      setProductFormOpen(false);
      await loadProducts();
      await loadDataLogs(0);
    } catch (saveError) {
      setProductError(saveError.message || "The product could not be saved.");
    } finally {
      setProductSaving(false);
    }
  };

  const toggleProductStock = async (product) => {
    const inStock = product.inStock === false;
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/products/" + product.id + "/stock", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inStock }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "The stock status could not be updated.");
      setCatalogProducts((items) => items.map((item) => item.id === product.id ? result.product : item));
      await loadDataLogs(0);
    } catch (stockError) {
      setError(stockError.message || "The stock status could not be updated.");
    } finally {
      setLoading(false);
    }
  };

  const deleteProduct = async (product) => {
    if (!window.confirm("Delete “" + product.name + "” from the shop? It will be removed from the storefront.")) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/products/" + product.id, { method: "DELETE" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "The product could not be deleted.");
      await loadProducts();
      await loadDataLogs(0);
    } catch (deleteError) {
      setError(deleteError.message || "The product could not be deleted.");
    } finally {
      setLoading(false);
    }
  };

  const productCategories = [...new Set(catalogProducts.map((product) => product.category))].sort();
  const filteredAdminProducts = catalogProducts.filter((product) =>
    (productCategory === "All categories" || product.category === productCategory) &&
    (product.name + " " + product.category + " " + product.detail).toLowerCase().includes(productSearch.toLowerCase())
  );

  const saveOrder = async (event) => {
    event.preventDefault();
    setOrderSaving(true);
    setOrderError("");
    const payload = {
      customer: { name: orderDraft.customerName, phone: orderDraft.phone, address: orderDraft.address, pin: orderDraft.pin },
      consent: orderDraft.consent,
      orderType: orderDraft.orderType,
      paymentMethod: orderDraft.paymentMethod,
      ...(orderDraft.orderType === "subscription"
        ? { planId: orderDraft.planId }
        : { items: orderDraft.items.map((item) => ({ productId: Number(item.productId), size: item.size, quantity: Number(item.quantity) })) }),
    };
    try {
      const response = await fetch(
        editingOrderId ? "/api/admin/orders/" + editingOrderId : "/api/admin/orders",
        { method: editingOrderId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) },
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "The order could not be saved.");
      setOrderFormOpen(false);
      setOrderError("");
      await Promise.all([loadEntries(editingOrderId ? offset : 0), loadDataLogs(0)]);
    } catch (saveError) {
      setOrderError(saveError.message || "The order could not be saved.");
    } finally {
      setOrderSaving(false);
    }
  };

  const deleteOrder = async (orderId) => {
    const confirmed = window.confirm("Delete this order from the admin list? It will remain in the customer’s order history and can be restored.");
    if (!confirmed) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/orders/" + orderId, { method: "DELETE" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "The order could not be deleted.");
      await Promise.all([loadEntries(offset), loadDataLogs(0)]);
    } catch (deleteError) {
      setError(deleteError.message || "The order could not be deleted.");
    } finally {
      setLoading(false);
    }
  };

  const restoreOrder = async (orderId) => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/orders/" + orderId + "/restore", { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "The order could not be restored.");
      await Promise.all([loadEntries(offset), loadDataLogs(0)]);
    } catch (restoreError) {
      setError(restoreError.message || "The order could not be restored.");
    } finally {
      setLoading(false);
    }
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
        <nav className="admin-section-tabs" aria-label="Admin dashboard sections">
          <button type="button" className={activeSection === "orders" ? "active" : ""} onClick={() => setActiveSection("orders")}>Orders</button>
          <button type="button" className={activeSection === "products" ? "active" : ""} onClick={() => setActiveSection("products")}>Products</button>
          <button type="button" className={activeSection === "signins" ? "active" : ""} onClick={() => setActiveSection("signins")}>Customer Sign-ins</button>
          <button type="button" className={activeSection === "logs" ? "active" : ""} onClick={() => setActiveSection("logs")}>Data Logs</button>
        </nav>

        <div className="admin-heading-row">
          <div>
            <p className="admin-eyebrow">{activeSection === "orders" ? "CUSTOMER REQUESTS" : activeSection === "products" ? "SHOP CATALOG" : activeSection === "signins" ? "ACCOUNT ACTIVITY" : "ADMIN ACTIVITY"}</p>
            <h1>{activeSection === "orders" ? "Order dashboard" : activeSection === "products" ? "Product management" : activeSection === "signins" ? "Customer Sign-ins" : "Data Logs"}</h1>
            <p className="admin-intro">
              {activeSection === "orders"
                ? "Create, edit, archive, and restore customer orders."
                : activeSection === "products"
                  ? "Create, update, or remove products and publish changes directly to the storefront."
                  : activeSection === "signins"
                    ? "See account names and successful sign-ins recorded from this update onward."
                    : "Review product and order changes made by an admin."}
            </p>
          </div>
          <div className="admin-heading-actions">
            {activeSection === "orders" && <button className="admin-primary admin-create-order" type="button" onClick={startCreateOrder}>＋ Create order</button>}
            {activeSection === "products" && <button className="admin-primary" type="button" onClick={startCreateProduct}>＋ Add product</button>}
            <button className="admin-refresh" type="button" onClick={() => {
              if (activeSection === "orders") loadEntries(0);
              else if (activeSection === "products") loadProducts();
              else if (activeSection === "signins") loadLoginCustomers(0);
              else loadDataLogs(0);
            }} disabled={loading}>
              {loading ? "Refreshing…" : "Refresh"}
            </button>
          </div>
        </div>

        {error && <p className="admin-error admin-page-error" role="alert">{error}</p>}

        {activeSection === "orders" && (
          <>
            <div className="admin-count">{total} {total === 1 ? "order" : "orders"} including archived orders</div>
            {entries.length === 0 && !loading ? (
              <section className="admin-empty">
                <span>✿</span>
                <h2>No orders yet</h2>
                <p>Customer requests will appear here when they submit them.</p>
              </section>
            ) : (
              <div className="admin-entry-list">
                {entries.map((entry) => (
                  <article className={"admin-entry " + (entry.deleted_at ? "is-deleted" : "")} key={entry.id}>
                    <div className="admin-entry-heading">
                      <div>
                        <span className="admin-order-id">Order #{entry.id}</span>
                        <span className={"admin-type " + (entry.order_type === "subscription" ? "subscription" : "")}>
                          {entry.order_type === "subscription" ? "Subscription" : "Shop order"}
                        </span>
                        {entry.deleted_at && <span className="admin-deleted-badge">Deleted</span>}
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
                        <h2>Order details</h2>
                        <ul className="admin-items">
                          {entry.items.map((item, index) => (
                            <li key={index}>{item.name} · {item.size} · Qty {item.quantity} · ₹{item.lineTotal}</li>
                          ))}
                        </ul>
                        <p className="admin-payment-line">Preference: {entry.payment_method.toUpperCase()}</p>
                        <strong className="admin-total">₹{entry.total_rupees}</strong>
                      </section>
                    </div>
                    <div className="admin-order-actions">
                      {!entry.deleted_at && <button type="button" onClick={() => startEditOrder(entry)}>Edit order</button>}
                      {entry.deleted_at
                        ? <button type="button" className="restore" disabled={loading} onClick={() => restoreOrder(entry.id)}>Restore order</button>
                        : <button type="button" className="delete" disabled={loading} onClick={() => deleteOrder(entry.id)}>Delete order</button>}
                    </div>
                  </article>
                ))}
              </div>
            )}
            {total > pageSize && (
              <nav className="admin-pagination" aria-label="Order pages">
                <button type="button" onClick={() => loadEntries(Math.max(0, offset - pageSize))} disabled={offset === 0 || loading}>Newer</button>
                <span>{offset + 1}–{Math.min(offset + entries.length, total)} of {total}</span>
                <button type="button" onClick={() => loadEntries(offset + pageSize)} disabled={offset + pageSize >= total || loading}>Older</button>
              </nav>
            )}
            <p className="admin-privacy-note">Delete keeps the order in the customer’s history and can be reversed with Restore.</p>
          </>
        )}

        {activeSection === "products" && (
          <section className="admin-products-section">
            <div className="admin-products-tools">
              <label className="admin-product-search">
                <span aria-hidden="true">⌕</span>
                <input type="search" placeholder="Search products, details, or categories" value={productSearch} onChange={(event) => setProductSearch(event.target.value)} aria-label="Search products" />
              </label>
              <label className="admin-category-filter">Category
                <select value={productCategory} onChange={(event) => setProductCategory(event.target.value)}>
                  <option>All categories</option>
                  {productCategories.map((category) => <option key={category}>{category}</option>)}
                </select>
              </label>
            </div>
            <div className="admin-count">{filteredAdminProducts.length} {filteredAdminProducts.length === 1 ? "product" : "products"} shown</div>
            {filteredAdminProducts.length ? (
              <div className="admin-product-grid">
                {filteredAdminProducts.map((product) => (
                  <article className="admin-product-card" key={product.id}>
                    <div className={"admin-product-symbol " + (product.color || "product")}>{product.icon || "✦"}</div>
                    <div className="admin-product-content">
                      <div className="admin-product-card-heading"><span>{product.category}</span><b>₹{product.price}</b></div>
                      <span className={"admin-stock-badge " + (product.inStock === false ? "out" : "in")}>{product.inStock === false ? "Out of stock" : "In stock"}</span>
                      <h2>{product.name}</h2>
                      <p>{product.detail}</p>
                      {product.tag && <small>{product.tag}</small>}
                    </div>
                    <div className="admin-product-actions">
                      <button type="button" className={"stock-toggle " + (product.inStock === false ? "restock" : "mark-out")} onClick={() => toggleProductStock(product)} disabled={loading}>{product.inStock === false ? "Mark in stock" : "Mark out of stock"}</button>
                      <button type="button" onClick={() => startEditProduct(product)}>Edit product</button>
                      <button type="button" className="danger" onClick={() => deleteProduct(product)} disabled={loading}>Delete</button>
                    </div>
                  </article>
                ))}
              </div>
            ) : <section className="admin-empty"><span>✦</span><h2>No products match</h2><p>Try another name or category, or add a new product.</p></section>}
          </section>
        )}

        {activeSection === "signins" && (
          <section className="admin-login-activity">
            <div className="admin-login-stats">
              <article><strong>{registeredCustomers}</strong><span>Registered accounts</span></article>
              <article><strong>{customersLoggedIn}</strong><span>Customers who signed in</span></article>
              <article><strong>{totalLogins}</strong><span>Recorded sign-ins</span></article>
            </div>
            <h2 className="admin-subheading">Customers who have signed in</h2>
            {loginCustomers.length === 0 && !loading ? (
              <section className="admin-empty">
                <span>♙</span>
                <h2>No sign-ins recorded yet</h2>
                <p>Successful customer sign-ins will appear here from now on.</p>
              </section>
            ) : (
              <div className="admin-login-table-wrap">
                <table className="admin-login-table">
                  <thead><tr><th>Username</th><th>Name</th><th>Last sign-in</th><th>Sign-ins</th></tr></thead>
                  <tbody>
                    {loginCustomers.map((customer) => (
                      <tr key={customer.id}>
                        <td><strong>{customer.username || "Username unavailable"}</strong></td>
                        <td>{customer.name || "Name not added"}</td>
                        <td>{customer.last_login_at ? formatDate(customer.last_login_at) : "—"}</td>
                        <td>{customer.login_count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {loginCustomersTotal > pageSize && (
              <nav className="admin-pagination" aria-label="Customer sign-in pages">
                <button type="button" onClick={() => loadLoginCustomers(Math.max(0, loginOffset - pageSize))} disabled={loginOffset === 0 || loading}>Newer</button>
                <span>{loginOffset + 1}–{Math.min(loginOffset + loginCustomers.length, loginCustomersTotal)} of {loginCustomersTotal}</span>
                <button type="button" onClick={() => loadLoginCustomers(loginOffset + pageSize)} disabled={loginOffset + pageSize >= loginCustomersTotal || loading}>Older</button>
              </nav>
            )}
            <h2 className="admin-subheading">Recent sign-in activity</h2>
            {recentLogins.length === 0 ? (
              <p className="admin-activity-empty">No sign-in events yet.</p>
            ) : (
              <div className="admin-recent-logins">
                {recentLogins.map((login) => (
                  <article key={login.id}>
                    <div><strong>{login.name || login.username || "Customer"}</strong><span>{login.username ? "@" + login.username : "Username unavailable"}</span></div>
                    <time dateTime={login.logged_in_at}>{formatDate(login.logged_in_at)}</time>
                  </article>
                ))}
              </div>
            )}
            <p className="admin-privacy-note">Sign-in tracking starts with this update. Earlier sign-ins were not recorded. Passwords and delivery addresses are not shown.</p>
          </section>
        )}

        {activeSection === "logs" && (
          <section className="admin-data-logs">
            <div className="admin-count">{dataLogsTotal} {dataLogsTotal === 1 ? "record" : "records"}</div>
            {dataLogs.length === 0 && !loading ? (
              <section className="admin-empty">
                <span>⌁</span>
                <h2>No data logs yet</h2>
                <p>Product and order changes made by an admin will be recorded here.</p>
              </section>
            ) : (
              <div className="admin-log-list">
                {dataLogs.map((log) => (
                  <article className="admin-log-entry" key={log.id}>
                    <div className="admin-log-heading">
                      <span className={"admin-log-action " + log.action}>{log.action}</span>
                      <strong>{log.entity_type === "product" ? "Product" : "Order"} #{log.entity_id}</strong>
                      <time dateTime={log.created_at}>{formatDate(log.created_at)}</time>
                    </div>
                    <p>
                      {log.entity_type === "product"
                        ? (log.action === "deleted" ? "Product removed from the storefront." : log.action === "created" ? "Product added: " : "Product updated: ") + (log.details?.name || "")
                        : log.action === "updated"
                          ? "Changed: " + ((log.details?.changedFields || []).join(", ") || "No field changes") + " · Total ₹" + log.details?.previousTotal + " → ₹" + log.details?.newTotal
                          : log.action === "created"
                            ? (log.details?.orderType === "subscription" ? "Subscription order" : "Shop order") + " created · Total ₹" + log.details?.total
                            : log.action === "deleted"
                              ? "Order moved to deleted status; customer history is retained."
                              : "Order restored to the active order list."}
                    </p>
                  </article>
                ))}
              </div>
            )}
            {dataLogsTotal > pageSize && (
              <nav className="admin-pagination" aria-label="Data log pages">
                <button type="button" onClick={() => loadDataLogs(Math.max(0, dataLogsOffset - pageSize))} disabled={dataLogsOffset === 0 || loading}>Newer</button>
                <span>{dataLogsOffset + 1}–{Math.min(dataLogsOffset + dataLogs.length, dataLogsTotal)} of {dataLogsTotal}</span>
                <button type="button" onClick={() => loadDataLogs(dataLogsOffset + pageSize)} disabled={dataLogsOffset + pageSize >= dataLogsTotal || loading}>Older</button>
              </nav>
            )}
          </section>
        )}

        {orderFormOpen && (
          <div className="admin-modal-backdrop">
            <section className="admin-order-modal" role="dialog" aria-modal="true" aria-labelledby="order-modal-title">
              <div className="admin-modal-heading">
                <div>
                  <p className="admin-eyebrow">{editingOrderId ? "EDIT ORDER #" + editingOrderId : "NEW ADMIN ORDER"}</p>
                  <h2 id="order-modal-title">{editingOrderId ? "Edit order" : "Create order"}</h2>
                </div>
                <button type="button" className="admin-modal-close" aria-label="Close" onClick={() => setOrderFormOpen(false)}>×</button>
              </div>
              <form className="admin-order-form" onSubmit={saveOrder}>
                <div className="admin-form-grid">
                  <label>Customer name
                    <input value={orderDraft.customerName} maxLength="100" onChange={(event) => setOrderDraft({ ...orderDraft, customerName: event.target.value })} required />
                  </label>
                  <label>Phone number
                    <input type="tel" inputMode="numeric" pattern="[0-9]{10}" maxLength="10" value={orderDraft.phone} onChange={(event) => setOrderDraft({ ...orderDraft, phone: event.target.value.replace(/\D/g, "").slice(0, 10) })} placeholder="10-digit mobile number" required />
                  </label>
                  <label className="full-field">Delivery address
                    <textarea rows="2" maxLength="500" value={orderDraft.address} onChange={(event) => setOrderDraft({ ...orderDraft, address: event.target.value })} required />
                  </label>
                  <label>PIN code
                    <input inputMode="numeric" pattern="[0-9]{6}" maxLength="6" value={orderDraft.pin} onChange={(event) => setOrderDraft({ ...orderDraft, pin: event.target.value.replace(/\D/g, "").slice(0, 6) })} required />
                  </label>
                  <label>Order type
                    <select value={orderDraft.orderType} onChange={(event) => setOrderDraft({ ...orderDraft, orderType: event.target.value })}>
                      <option value="product">Shop order</option><option value="subscription">Subscription</option>
                    </select>
                  </label>
                  {orderDraft.orderType === "subscription" ? (
                    <label className="full-field">Subscription plan
                      <select value={orderDraft.planId} onChange={(event) => setOrderDraft({ ...orderDraft, planId: event.target.value })}>
                        {adminPlans.map((plan) => <option value={plan.id} key={plan.id}>{plan.name}</option>)}
                      </select>
                    </label>
                  ) : (
                    <div className="admin-form-items full-field">
                      <div className="admin-form-items-heading"><strong>Order items</strong><button type="button" onClick={() => setOrderDraft({ ...orderDraft, items: [...orderDraft.items, { productId: "1", size: "1 L", quantity: 1 }] })}>＋ Add item</button></div>
                      {orderDraft.items.map((item, index) => {
                        const sizes = sizesForProduct(item.productId, catalogProducts);
                        return (
                          <div className="admin-order-item-row" key={index}>
                            <select aria-label={"Product " + (index + 1)} value={item.productId} onChange={(event) => {
                              const nextId = event.target.value;
                              const nextItems = orderDraft.items.map((row, rowIndex) => rowIndex === index ? { ...row, productId: nextId, size: sizesForProduct(nextId, catalogProducts)[0] } : row);
                              setOrderDraft({ ...orderDraft, items: nextItems });
                            }}>
                              {catalogProducts.map((product) => <option value={product.id} key={product.id}>{product.name}</option>)}
                            </select>
                            <select aria-label={"Size " + (index + 1)} value={item.size} onChange={(event) => setOrderDraft({ ...orderDraft, items: orderDraft.items.map((row, rowIndex) => rowIndex === index ? { ...row, size: event.target.value } : row) })}>
                              {sizes.map((size) => <option value={size} key={size}>{size}</option>)}
                            </select>
                            <input aria-label={"Quantity " + (index + 1)} type="number" min="1" max="99" value={item.quantity} onChange={(event) => setOrderDraft({ ...orderDraft, items: orderDraft.items.map((row, rowIndex) => rowIndex === index ? { ...row, quantity: event.target.value } : row) })} required />
                            <button type="button" className="admin-remove-item" aria-label={"Remove item " + (index + 1)} disabled={orderDraft.items.length < 2} onClick={() => setOrderDraft({ ...orderDraft, items: orderDraft.items.filter((_, rowIndex) => rowIndex !== index) })}>−</button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <label className="full-field">Payment preference
                    <select value={orderDraft.paymentMethod} onChange={(event) => setOrderDraft({ ...orderDraft, paymentMethod: event.target.value })}>
                      {paymentMethods.map((method) => <option value={method} key={method}>{method.toUpperCase()}</option>)}
                    </select>
                  </label>
                  <label className="admin-consent-row full-field">
                    <input type="checkbox" checked={orderDraft.consent} onChange={(event) => setOrderDraft({ ...orderDraft, consent: event.target.checked })} required />
                    <span>I confirm the customer agreed to save these order and delivery details.</span>
                  </label>
                </div>
                {orderError && <p className="admin-error" role="alert">{orderError}</p>}
                <div className="admin-modal-actions">
                  <button type="button" onClick={() => setOrderFormOpen(false)}>Cancel</button>
                  <button className="admin-primary" type="submit" disabled={orderSaving}>{orderSaving ? "Saving…" : editingOrderId ? "Save changes" : "Create order"}</button>
                </div>
              </form>
            </section>
          </div>
        )}
        {productFormOpen && (
          <div className="admin-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setProductFormOpen(false); }}>
            <section className="admin-modal admin-product-modal" role="dialog" aria-modal="true" aria-labelledby="admin-product-form-title">
              <div className="admin-modal-heading">
                <div><p className="admin-eyebrow">SHOP CATALOG</p><h2 id="admin-product-form-title">{editingProductId ? "Edit product" : "Create product"}</h2></div>
                <button type="button" aria-label="Close product form" onClick={() => setProductFormOpen(false)}>×</button>
              </div>
              <p className="admin-intro">Changes save to your shop catalog and appear on the storefront.</p>
              <form onSubmit={saveProduct}>
                <div className="admin-product-form-grid">
                  <section className="admin-product-info-panel">
                    <div className="admin-form-section-title"><span>01</span><div><strong>Product details</strong><small>Name, category, and the description customers see.</small></div></div>
                    <div className="admin-product-info-fields">
                      <label>Product name<input maxLength="120" value={productDraft.name} onChange={(event) => setProductDraft({ ...productDraft, name: event.target.value })} required placeholder="e.g. Farm fresh yogurt" /></label>
                      <label>Category<input maxLength="80" list="admin-product-categories" value={productDraft.category} onChange={(event) => setProductDraft({ ...productDraft, category: event.target.value })} required placeholder="Choose or enter a category" /></label>
                      <datalist id="admin-product-categories">{productCategories.map((category) => <option key={category} value={category} />)}</datalist>
                      <label className="wide-field">Description and pack information<input maxLength="500" value={productDraft.detail} onChange={(event) => setProductDraft({ ...productDraft, detail: event.target.value })} required placeholder="e.g. Fresh and creamy · 500 g" /></label>
                      <label>Product icon<input maxLength="16" value={productDraft.icon} onChange={(event) => setProductDraft({ ...productDraft, icon: event.target.value })} placeholder="🥛" /></label>
                      <label>Short label<input maxLength="40" value={productDraft.tag} onChange={(event) => setProductDraft({ ...productDraft, tag: event.target.value })} placeholder="FARM FRESH" /></label>
                      <label className="admin-stock-checkbox">
                        <input type="checkbox" checked={productDraft.inStock} onChange={(event) => setProductDraft({ ...productDraft, inStock: event.target.checked })} />
                        <span><strong>Available for purchase</strong><small>Turn this off to mark the product out of stock.</small></span>
                      </label>
                    </div>
                  </section>
                  <section className="admin-pack-editor">
                    <div className="admin-form-section-title"><span>02</span><div><strong>Pack sizes &amp; prices</strong><small>Set the exact price customers pay for each size.</small></div></div>
                    <div className="admin-pack-list">
                      {productDraft.packSizes.map((pack, index) => (
                        <div className="admin-pack-row" key={index}>
                          <label>Pack size<input maxLength="32" value={pack.label} onChange={(event) => updateProductPack(index, "label", event.target.value)} required placeholder="e.g. 500 ml" /></label>
                          <label>Price (₹)<input type="number" min="1" max="1000000" step="1" value={pack.price} onChange={(event) => updateProductPack(index, "price", event.target.value)} required placeholder="e.g. 80" /></label>
                          <button type="button" className="admin-pack-remove" aria-label={"Remove pack size " + (index + 1)} disabled={productDraft.packSizes.length <= 1} onClick={() => removeProductPack(index)}>×</button>
                        </div>
                      ))}
                    </div>
                    <button type="button" className="admin-add-pack" disabled={productDraft.packSizes.length >= 12} onClick={addProductPack}>＋ Add another pack size</button>
                  </section>
                </div>
                {productError && <p className="admin-error" role="alert">{productError}</p>}
                <div className="admin-modal-actions">
                  <button type="button" onClick={() => setProductFormOpen(false)}>Cancel</button>
                  <button className="admin-primary" type="submit" disabled={productSaving}>{productSaving ? "Saving…" : editingProductId ? "Save product" : "Create product"}</button>
                </div>
              </form>
            </section>
          </div>
        )}

        <p className="admin-privacy-note">All customer and order management actions are restricted to admin sign-in.</p>
      </section>
    </main>
  );
}

export default AdminDashboard;
