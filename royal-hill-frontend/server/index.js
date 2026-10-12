const crypto = require("node:crypto");
const path = require("node:path");
const express = require("express");
const helmet = require("helmet");
const { Pool } = require("pg");

const app = express();
const port = Number(process.env.PORT || 5000);
const sessionCookie = "royal_hill_admin";
const customerSessionCookie = "royal_hill_customer";
const sessionLifetimeSeconds = 8 * 60 * 60;
const rateBuckets = new Map();

const products = {
  1: { name: "Farm Fresh Milk", basePrice: 68, baseAmount: 1000, milk: true },
  2: { name: "Fresh Cow Milk", basePrice: 75, baseAmount: 1000, milk: true },
  3: { name: "Creamy Paneer", basePrice: 110, baseAmount: 200 },
  4: { name: "Pure Desi Ghee", basePrice: 420, baseAmount: 500 },
  5: { name: "Kesar Peda", basePrice: 180, baseAmount: 250 },
  6: { name: "Thick Curd", basePrice: 55, baseAmount: 400 },
  7: { name: "Malai Paneer", basePrice: 250, baseAmount: 500 },
  8: { name: "A2 Cow Ghee", basePrice: 250, baseAmount: 250 },
  9: { name: "Milk Cake", basePrice: 160, baseAmount: 250 },
};

const subscriptionPlans = {
  "daily-milk": { name: "Daily Cow Milk", price: 260, period: "30 days" },
  "fresh-plus": { name: "Fresh Plus", price: 460, period: "30 days" },
};

const paymentMethods = new Set(["upi", "card", "emi", "netbanking", "cod"]);
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      frameAncestors: ["'none'"],
    },
  },
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
}));
app.use(express.json({ limit: "32kb" }));

function rateLimit(key, limit, windowMs) {
  const now = Date.now();
  const bucket = rateBuckets.get(key);
  if (!bucket || now - bucket.startedAt >= windowMs) {
    rateBuckets.set(key, { startedAt: now, count: 1 });
    return false;
  }
  bucket.count += 1;
  return bucket.count > limit;
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(left || "");
  const rightBuffer = Buffer.from(right || "");
  const padded = Buffer.alloc(rightBuffer.length);
  leftBuffer.copy(padded, 0, 0, Math.min(leftBuffer.length, padded.length));
  const equal = crypto.timingSafeEqual(padded, rightBuffer);
  return equal && leftBuffer.length === rightBuffer.length;
}

function createSessionToken() {
  const payload = Buffer.from(JSON.stringify({
    role: "admin",
    exp: Math.floor(Date.now() / 1000) + sessionLifetimeSeconds,
  })).toString("base64url");
  const signature = crypto.createHmac("sha256", process.env.SESSION_SECRET).update(payload).digest("base64url");
  return payload + "." + signature;
}

function readSessionToken(req) {
  const cookie = req.headers.cookie || "";
  const tokenPair = cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith(sessionCookie + "="));
  if (!tokenPair) return null;
  try {
    const token = decodeURIComponent(tokenPair.slice(sessionCookie.length + 1));
    const [payload, signature] = token.split(".");
    if (!payload || !signature) return null;
    const expected = crypto.createHmac("sha256", process.env.SESSION_SECRET).update(payload).digest();
    const actual = Buffer.from(signature, "base64url");
    if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return null;
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (session.role !== "admin" || session.exp <= Math.floor(Date.now() / 1000)) return null;
    return session;
  } catch {
    return null;
  }
}


function createCustomerSessionToken(customerId, loginMethod, verifiedIdentifier) {
  const payload = Buffer.from(JSON.stringify({
    role: "customer",
    customerId,
    loginMethod,
    verifiedIdentifier,
    exp: Math.floor(Date.now() / 1000) + sessionLifetimeSeconds,
  })).toString("base64url");
  const signature = crypto.createHmac("sha256", process.env.SESSION_SECRET).update(payload).digest("base64url");
  return payload + "." + signature;
}

function readCustomerSessionToken(req) {
  const cookie = req.headers.cookie || "";
  const tokenPair = cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith(customerSessionCookie + "="));
  if (!tokenPair) return null;
  try {
    const token = decodeURIComponent(tokenPair.slice(customerSessionCookie.length + 1));
    const [payload, signature] = token.split(".");
    if (!payload || !signature) return null;
    const expected = crypto.createHmac("sha256", process.env.SESSION_SECRET).update(payload).digest();
    const actual = Buffer.from(signature, "base64url");
    if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return null;
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (session.role !== "customer" || session.loginMethod !== "username" || !Number.isSafeInteger(session.customerId) || session.exp <= Math.floor(Date.now() / 1000)) return null;
    return session;
  } catch {
    return null;
  }
}

function requireCustomer(req, res, next) {
  const session = readCustomerSessionToken(req);
  if (!session) return res.status(401).json({ error: "Sign in with your username and password." });
  req.customerSession = session;
  return next();
}

function setCustomerCookie(res, token) {
  res.cookie(customerSessionCookie, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: sessionLifetimeSeconds * 1000,
    path: "/",
  });
}

function normalizeUsername(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function validUsername(username) {
  return /^[a-z0-9_]{3,24}$/.test(username);
}

function hashCustomerPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return salt + ":" + hash;
}

function verifyCustomerPassword(password, storedHash) {
  if (typeof storedHash !== "string") return false;
  const [salt, encodedHash] = storedHash.split(":");
  if (!/^[a-f0-9]{32}$/.test(salt || "") || !/^[a-f0-9]{128}$/.test(encodedHash || "")) return false;
  const expected = Buffer.from(encodedHash, "hex");
  const actual = crypto.scryptSync(password, salt, expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

function requireAdmin(req, res, next) {
  if (readSessionToken(req)) return next();
  return res.status(401).json({ error: "Sign in to view customer entries." });
}

function validateCustomer(customer, consent) {
  if (!customer || typeof customer !== "object") return "Customer details are required.";
  const { name, phone, address, pin } = customer;
  if (typeof name !== "string" || name.trim().length < 2 || name.trim().length > 100) return "Enter a valid name.";
  if (typeof phone !== "string" || !/^\d{10}$/.test(phone)) return "Enter a 10-digit phone number.";
  if (typeof address !== "string" || address.trim().length < 5 || address.trim().length > 500) return "Enter a valid delivery address.";
  if (typeof pin !== "string" || !/^\d{6}$/.test(pin)) return "Enter a 6-digit PIN code.";
  if (consent !== true) return "Consent is required to save delivery details.";
  return null;
}

function productSizeOptions(product) {
  return product.milk
    ? [{ label: "500 ml", amount: 500 }, { label: "1 L", amount: 1000 }, { label: "2 L", amount: 2000 }]
    : [{ label: "250 gm", amount: 250 }, { label: "500 gm", amount: 500 }, { label: "1 kg", amount: 1000 }];
}

function calculateProductItems(inputItems) {
  if (!Array.isArray(inputItems) || inputItems.length < 1 || inputItems.length > 27) {
    return { error: "Your basket is empty or contains too many product and size combinations." };
  }
  const result = [];
  let total = 0;
  for (const item of inputItems) {
    const product = products[item?.productId];
    const quantity = Number(item?.quantity);
    const size = product && productSizeOptions(product).find((option) => option.label === item?.size);
    if (!product || !size) {
      return { error: "A basket item has an invalid product or size. Please review your basket." };
    }
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
      return { error: "Each product quantity must be from 1 to 99." };
    }
    const unitPrice = Math.max(1, Math.round((product.basePrice * size.amount) / product.baseAmount));
    const lineTotal = unitPrice * quantity;
    total += lineTotal;
    result.push({ name: product.name, size: size.label, quantity, unitPrice, lineTotal });
  }
  return { items: result, total };
}

function calculateSubscriptionItem(planId) {
  const plan = subscriptionPlans[planId];
  if (!plan) return { error: "Choose a valid subscription plan." };
  return {
    items: [{ name: plan.name, size: plan.period, quantity: 1, unitPrice: plan.price, lineTotal: plan.price }],
    total: plan.price,
  };
}


app.post("/api/auth/register", async (req, res) => {
  const username = normalizeUsername(req.body?.username);
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  if (!validUsername(username)) return res.status(400).json({ error: "Username must be 3–24 characters using letters, numbers, or underscores." });
  if (password.length < 8 || password.length > 128) return res.status(400).json({ error: "Password must be at least 8 characters." });
  if (rateLimit("customer-auth-ip:" + req.ip, 20, 60 * 60 * 1000) || rateLimit("customer-register:" + username, 5, 60 * 60 * 1000)) {
    return res.status(429).json({ error: "Too many attempts. Please wait and try again." });
  }
  try {
    const saved = await pool.query(
      "INSERT INTO customer_accounts (username, password_hash) VALUES ($1, $2) " +
      "RETURNING id, username, BTRIM(phone) AS phone, COALESCE(email, '') AS email, COALESCE(full_name, '') AS name, " +
      "COALESCE(delivery_address, '') AS address, COALESCE(postal_code, '') AS pin",
      [username, hashCustomerPassword(password)],
    );
    const profile = saved.rows[0];
    setCustomerCookie(res, createCustomerSessionToken(Number(profile.id), "username", username));
    return res.status(201).json({ authenticated: true, profile });
  } catch (error) {
    if (error.code === "23505") return res.status(409).json({ error: "That username is already taken. Choose a different one." });
    console.error("Customer account could not be created:", error.message);
    return res.status(500).json({ error: "We could not create your account. Please try again." });
  }
});

app.post("/api/auth/login", async (req, res) => {
  const username = normalizeUsername(req.body?.username);
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  if (!validUsername(username) || !password || password.length > 128) return res.status(401).json({ error: "Username or password is incorrect." });
  if (rateLimit("customer-auth-ip:" + req.ip, 20, 60 * 60 * 1000) || rateLimit("customer-login:" + username, 8, 15 * 60 * 1000)) {
    return res.status(429).json({ error: "Too many sign-in attempts. Please wait and try again." });
  }
  try {
    const result = await pool.query("SELECT id, password_hash FROM customer_accounts WHERE username = $1", [username]);
    const account = result.rows[0];
    if (!account || !verifyCustomerPassword(password, account.password_hash)) return res.status(401).json({ error: "Username or password is incorrect." });
    const saved = await pool.query(
      "SELECT id, username, BTRIM(phone) AS phone, COALESCE(email, '') AS email, COALESCE(full_name, '') AS name, " +
      "COALESCE(delivery_address, '') AS address, COALESCE(postal_code, '') AS pin FROM customer_accounts WHERE id = $1",
      [account.id],
    );
    setCustomerCookie(res, createCustomerSessionToken(Number(account.id), "username", username));
    return res.json({ authenticated: true, profile: saved.rows[0] });
  } catch (error) {
    console.error("Customer sign-in could not be completed:", error.message);
    return res.status(500).json({ error: "We could not sign you in. Please try again." });
  }
});

app.post("/api/auth/logout", (_req, res) => {
  res.clearCookie(customerSessionCookie, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
  });
  return res.json({ authenticated: false });
});

app.get("/api/account/session", requireCustomer, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, username, BTRIM(phone) AS phone, COALESCE(email, '') AS email, COALESCE(full_name, '') AS name, " +
      "COALESCE(delivery_address, '') AS address, COALESCE(postal_code, '') AS pin " +
      "FROM customer_accounts WHERE id = $1",
      [req.customerSession.customerId],
    );
    if (!result.rowCount) return res.status(401).json({ error: "Your account could not be found. Please sign in again." });
    return res.json({ authenticated: true, profile: result.rows[0] });
  } catch (error) {
    console.error("Customer account could not be loaded:", error.message);
    return res.status(500).json({ error: "Your account could not be loaded." });
  }
});

app.get("/api/account/profile", requireCustomer, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, username, BTRIM(phone) AS phone, COALESCE(email, '') AS email, COALESCE(full_name, '') AS name, " +
      "COALESCE(delivery_address, '') AS address, COALESCE(postal_code, '') AS pin " +
      "FROM customer_accounts WHERE id = $1",
      [req.customerSession.customerId],
    );
    if (!result.rowCount) return res.status(404).json({ error: "Customer account not found." });
    return res.json({ profile: result.rows[0] });
  } catch (error) {
    console.error("Customer profile could not be loaded:", error.message);
    return res.status(500).json({ error: "Customer profile could not be loaded." });
  }
});

app.put("/api/account/profile", requireCustomer, async (req, res) => {
  const { name, address, pin } = req.body || {};
  const rawPhone = typeof req.body?.phone === "string" ? req.body.phone.trim() : "";
  const phone = rawPhone || null;
  if (typeof name !== "string" || name.trim().length < 2 || name.trim().length > 100) {
    return res.status(400).json({ error: "Enter a name between 2 and 100 characters." });
  }
  if (phone && !/^\d{10}$/.test(phone)) {
    return res.status(400).json({ error: "Enter a valid 10-digit mobile number or leave it blank." });
  }
  if (typeof address !== "string" || address.trim().length < 5 || address.trim().length > 500) {
    return res.status(400).json({ error: "Enter a delivery address between 5 and 500 characters." });
  }
  if (typeof pin !== "string" || !/^\d{6}$/.test(pin)) {
    return res.status(400).json({ error: "Enter a valid 6-digit PIN code." });
  }
  try {
    const result = await pool.query(
      "UPDATE customer_accounts SET phone = $1, full_name = $2, delivery_address = $3, postal_code = $4, updated_at = NOW() " +
      "WHERE id = $5 RETURNING id, username, BTRIM(phone) AS phone, full_name AS name, delivery_address AS address, postal_code AS pin",
      [phone, name.trim(), address.trim(), pin, req.customerSession.customerId],
    );
    if (!result.rowCount) return res.status(404).json({ error: "Customer account not found." });
    return res.json({ profile: result.rows[0] });
  } catch (error) {
    if (error.code === "23505") return res.status(409).json({ error: "That mobile number is already saved to another account." });
    console.error("Customer profile could not be saved:", error.message);
    return res.status(500).json({ error: "Your details could not be saved." });
  }
});



app.get("/api/account/subscription", requireCustomer, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, created_at, items, total_rupees, created_at + INTERVAL '30 days' AS ends_at " +
      "FROM customer_orders WHERE customer_id = $1 AND order_type = 'subscription' " +
      "AND created_at > NOW() - INTERVAL '30 days' ORDER BY created_at DESC, id DESC LIMIT 1",
      [req.customerSession.customerId],
    );
    if (!result.rowCount) return res.json({ active: false });
    const subscription = result.rows[0];
    const items = Array.isArray(subscription.items) ? subscription.items : [];
    return res.json({
      active: true,
      id: subscription.id,
      planName: items[0]?.name || "Active subscription",
      totalRupees: subscription.total_rupees,
      startsAt: subscription.created_at,
      endsAt: subscription.ends_at,
    });
  } catch (error) {
    console.error("Customer subscription could not be loaded:", error.message);
    return res.status(500).json({ error: "Your subscription could not be loaded." });
  }
});

app.get("/api/account/subscription-days", requireCustomer, async (req, res) => {
  const month = typeof req.query.month === "string" ? req.query.month : "";
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return res.status(400).json({ error: "Choose a valid calendar month." });
  try {
    const indiaToday = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    if (month === indiaToday.slice(0, 7)) {
      const milkRows = await pool.query(
        "SELECT product_id, size, quantity FROM customer_daily_orders WHERE customer_id = $1 AND is_active = TRUE AND product_id IN (1, 2) ORDER BY created_at, id",
        [req.customerSession.customerId],
      );
      if (milkRows.rowCount) {
        const calculated = calculateProductItems(milkRows.rows.map((item) => ({ productId: Number(item.product_id), size: item.size, quantity: Number(item.quantity) })));
        if (!calculated.error) {
          await pool.query(
            "INSERT INTO customer_subscription_days (customer_id, delivery_date, status, items, total_rupees) VALUES ($1, $2::date, 'on', $3::jsonb, $4) ON CONFLICT (customer_id, delivery_date) DO NOTHING",
            [req.customerSession.customerId, indiaToday, JSON.stringify(calculated.items), calculated.total],
          );
        }
      }
    }
    const result = await pool.query(
      "SELECT delivery_date::text AS delivery_date, status, items, total_rupees, updated_at " +
      "FROM customer_subscription_days WHERE customer_id = $1 AND delivery_date >= $2::date AND delivery_date < ($2::date + INTERVAL '1 month') ORDER BY delivery_date",
      [req.customerSession.customerId, month + "-01"],
    );
    return res.json({ entries: result.rows });
  } catch (error) {
    console.error("Subscription calendar could not be loaded:", error.message);
    return res.status(500).json({ error: "Your subscription calendar could not be loaded." });
  }
});

app.put("/api/account/subscription-days/:date", requireCustomer, async (req, res) => {
  const deliveryDate = req.params.date;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(deliveryDate)) return res.status(400).json({ error: "Choose a valid delivery date." });
  const parsedDate = new Date(deliveryDate + "T00:00:00Z");
  if (!Number.isFinite(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== deliveryDate) return res.status(400).json({ error: "Choose a valid delivery date." });
  const indiaToday = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  if (deliveryDate < indiaToday) return res.status(400).json({ error: "Past delivery days can’t be changed." });
  const status = req.body?.status;
  if (status !== "on" && status !== "off") return res.status(400).json({ error: "Choose ON or OFF for this delivery day." });
  try {
    const milkRows = await pool.query(
      "SELECT product_id, product_name, size, quantity FROM customer_daily_orders " +
      "WHERE customer_id = $1 AND is_active = TRUE AND product_id IN (1, 2) ORDER BY created_at, id",
      [req.customerSession.customerId],
    );
    let snapshot = [];
    let total = 0;
    if (status === "on") {
      if (!milkRows.rowCount) return res.status(400).json({ error: "Add an active milk item in Daily order before scheduling a delivery." });
      const calculated = calculateProductItems(milkRows.rows.map((item) => ({ productId: Number(item.product_id), size: item.size, quantity: Number(item.quantity) })));
      if (calculated.error) return res.status(400).json({ error: calculated.error });
      snapshot = calculated.items;
      total = calculated.total;
    } else {
      const existing = await pool.query(
        "SELECT items, total_rupees FROM customer_subscription_days WHERE customer_id = $1 AND delivery_date = $2::date",
        [req.customerSession.customerId, deliveryDate],
      );
      if (existing.rowCount) {
        snapshot = existing.rows[0].items;
        total = existing.rows[0].total_rupees;
      } else if (milkRows.rowCount) {
        const calculated = calculateProductItems(milkRows.rows.map((item) => ({ productId: Number(item.product_id), size: item.size, quantity: Number(item.quantity) })));
        if (!calculated.error) { snapshot = calculated.items; total = calculated.total; }
      }
    }
    const saved = await pool.query(
      "INSERT INTO customer_subscription_days (customer_id, delivery_date, status, items, total_rupees) " +
      "VALUES ($1, $2::date, $3, $4::jsonb, $5) " +
      "ON CONFLICT (customer_id, delivery_date) DO UPDATE SET status = EXCLUDED.status, items = EXCLUDED.items, total_rupees = EXCLUDED.total_rupees, updated_at = NOW() " +
      "RETURNING delivery_date::text AS delivery_date, status, items, total_rupees, updated_at",
      [req.customerSession.customerId, deliveryDate, status, JSON.stringify(snapshot), total],
    );
    return res.json({ entry: saved.rows[0] });
  } catch (error) {
    console.error("Subscription day could not be saved:", error.message);
    return res.status(500).json({ error: "Your delivery choice could not be saved." });
  }
});

app.get("/api/account/daily-orders", requireCustomer, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, product_id, product_name, size, quantity, is_active, created_at " +
      "FROM customer_daily_orders WHERE customer_id = $1 ORDER BY created_at ASC, id ASC",
      [req.customerSession.customerId],
    );
    return res.json({ entries: result.rows });
  } catch (error) {
    console.error("Daily delivery list could not be loaded:", error.message);
    return res.status(500).json({ error: "Your daily delivery list could not be loaded." });
  }
});

app.post("/api/account/daily-orders", requireCustomer, async (req, res) => {
  const item = {
    productId: req.body?.productId,
    size: req.body?.size,
    quantity: req.body?.quantity,
  };
  const calculated = calculateProductItems([item]);
  if (calculated.error) return res.status(400).json({ error: calculated.error });
  try {
    const profile = await pool.query(
      "SELECT full_name, delivery_address, postal_code FROM customer_accounts WHERE id = $1",
      [req.customerSession.customerId],
    );
    if (!profile.rowCount || !profile.rows[0].full_name || !profile.rows[0].delivery_address || !profile.rows[0].postal_code) {
      return res.status(400).json({ error: "Save your name and delivery address in General before adding daily items." });
    }
    const product = products[item.productId];
    const saved = await pool.query(
      "INSERT INTO customer_daily_orders (customer_id, product_id, product_name, size, quantity) " +
      "VALUES ($1, $2, $3, $4, $5) RETURNING id, product_id, product_name, size, quantity, is_active, created_at",
      [req.customerSession.customerId, Number(item.productId), product.name, item.size, Number(item.quantity)],
    );
    return res.status(201).json({ entry: saved.rows[0] });
  } catch (error) {
    console.error("Daily delivery item could not be saved:", error.message);
    return res.status(500).json({ error: "Your daily delivery item could not be saved." });
  }
});

app.patch("/api/account/daily-orders/:id", requireCustomer, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: "Choose a valid daily item." });
  const hasQuantity = Object.prototype.hasOwnProperty.call(req.body || {}, "quantity");
  const hasActive = Object.prototype.hasOwnProperty.call(req.body || {}, "isActive");
  if (!hasQuantity && !hasActive) return res.status(400).json({ error: "Choose a quantity or active status to update." });
  const quantity = hasQuantity ? Number(req.body.quantity) : null;
  const isActive = hasActive ? req.body.isActive : null;
  if (hasQuantity && (!Number.isInteger(quantity) || quantity < 1 || quantity > 99)) {
    return res.status(400).json({ error: "Daily quantity must be from 1 to 99." });
  }
  if (hasActive && typeof isActive !== "boolean") return res.status(400).json({ error: "Choose whether this daily item is active." });
  try {
    const result = await pool.query(
      "UPDATE customer_daily_orders SET quantity = COALESCE($1, quantity), is_active = COALESCE($2, is_active), updated_at = NOW() " +
      "WHERE id = $3 AND customer_id = $4 RETURNING id, product_id, product_name, size, quantity, is_active, created_at",
      [quantity, isActive, id, req.customerSession.customerId],
    );
    if (!result.rowCount) return res.status(404).json({ error: "Daily item not found." });
    return res.json({ entry: result.rows[0] });
  } catch (error) {
    console.error("Daily delivery item could not be updated:", error.message);
    return res.status(500).json({ error: "Your daily delivery item could not be updated." });
  }
});

app.delete("/api/account/daily-orders/:id", requireCustomer, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: "Choose a valid daily item." });
  try {
    const result = await pool.query(
      "DELETE FROM customer_daily_orders WHERE id = $1 AND customer_id = $2 RETURNING id",
      [id, req.customerSession.customerId],
    );
    if (!result.rowCount) return res.status(404).json({ error: "Daily item not found." });
    return res.json({ removed: true });
  } catch (error) {
    console.error("Daily delivery item could not be removed:", error.message);
    return res.status(500).json({ error: "Your daily delivery item could not be removed." });
  }
});

app.get("/api/account/orders", requireCustomer, async (req, res) => {
  const parsedLimit = Number.parseInt(req.query.limit, 10);
  const parsedOffset = Number.parseInt(req.query.offset, 10);
  const limit = Number.isInteger(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 100) : 50;
  const offset = Number.isInteger(parsedOffset) ? Math.min(Math.max(parsedOffset, 0), 1000000) : 0;
  try {
    const [orders, count] = await Promise.all([
      pool.query(
        "SELECT id, created_at, customer_name, BTRIM(phone) AS phone, delivery_address, BTRIM(postal_code) AS postal_code, " +
        "order_type, items, total_rupees, payment_method FROM customer_orders " +
        "WHERE customer_id = $1 ORDER BY created_at DESC, id DESC LIMIT $2 OFFSET $3",
        [req.customerSession.customerId, limit, offset],
      ),
      pool.query("SELECT COUNT(*)::int AS total FROM customer_orders WHERE customer_id = $1", [req.customerSession.customerId]),
    ]);
    return res.json({ entries: orders.rows, total: count.rows[0].total, hasMore: offset + orders.rows.length < count.rows[0].total });
  } catch (error) {
    console.error("Customer order history could not be loaded:", error.message);
    return res.status(500).json({ error: "Your order history could not be loaded." });
  }
});

app.get("/api/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ ok: true });
  } catch {
    res.status(503).json({ ok: false });
  }
});

app.post("/api/orders", async (req, res) => {
  if (rateLimit("order:" + req.ip, 30, 60 * 60 * 1000)) {
    return res.status(429).json({ error: "Too many order requests. Please try again later." });
  }
  const customerError = validateCustomer(req.body?.customer, req.body?.consent);
  if (customerError) return res.status(400).json({ error: customerError });
  if (!paymentMethods.has(req.body?.paymentMethod)) {
    return res.status(400).json({ error: "Choose a valid payment preference." });
  }

  const orderType = req.body?.orderType;
  const calculated = orderType === "subscription"
    ? calculateSubscriptionItem(req.body?.planId)
    : orderType === "product"
      ? calculateProductItems(req.body?.items)
      : { error: "Choose a valid order type." };
  if (calculated.error) return res.status(400).json({ error: calculated.error });

  try {
    const result = await pool.query(
      "INSERT INTO customer_orders " +
      "(customer_name, phone, delivery_address, postal_code, order_type, items, total_rupees, payment_method, consented_at, customer_id) " +
      "VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, NOW(), $9) RETURNING id, created_at",
      [
        req.body.customer.name.trim(),
        req.body.customer.phone,
        req.body.customer.address.trim(),
        req.body.customer.pin,
        orderType,
        JSON.stringify(calculated.items),
        calculated.total,
        req.body.paymentMethod,
        readCustomerSessionToken(req)?.customerId || null,
      ],
    );
    return res.status(201).json({
      id: result.rows[0].id,
      createdAt: result.rows[0].created_at,
      total: calculated.total,
    });
  } catch (error) {
    console.error("Order entry could not be saved:", error.message);
    return res.status(500).json({ error: "We could not save your request. Please try again." });
  }
});

app.get("/api/admin/session", (req, res) => {
  if (readSessionToken(req)) return res.json({ authenticated: true });
  return res.status(401).json({ authenticated: false });
});

app.post("/api/admin/login", (req, res) => {
  if (rateLimit("login:" + req.ip, 8, 15 * 60 * 1000)) {
    return res.status(429).json({ error: "Too many sign-in attempts. Wait 15 minutes and try again." });
  }
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) return res.status(503).json({ error: "Dashboard access has not been configured." });
  if (!safeEqual(req.body?.password, adminPassword)) {
    return res.status(401).json({ error: "Password is incorrect." });
  }
  res.cookie(sessionCookie, createSessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: sessionLifetimeSeconds * 1000,
    path: "/",
  });
  return res.json({ authenticated: true });
});

app.post("/api/admin/logout", (_req, res) => {
  res.clearCookie(sessionCookie, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
  });
  return res.json({ authenticated: false });
});

app.get("/api/admin/orders", requireAdmin, async (req, res) => {
  const parsedLimit = Number.parseInt(req.query.limit, 10);
  const parsedOffset = Number.parseInt(req.query.offset, 10);
  const limit = Number.isInteger(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 100) : 50;
  const offset = Number.isInteger(parsedOffset) ? Math.min(Math.max(parsedOffset, 0), 100000) : 0;
  try {
    const [entries, count] = await Promise.all([
      pool.query(
        "SELECT id, created_at, customer_name, phone, delivery_address, postal_code, " +
        "order_type, items, total_rupees, payment_method FROM customer_orders " +
        "ORDER BY created_at DESC, id DESC LIMIT $1 OFFSET $2",
        [limit, offset],
      ),
      pool.query("SELECT COUNT(*)::int AS total FROM customer_orders"),
    ]);
    return res.json({ entries: entries.rows, total: count.rows[0].total, limit, offset });
  } catch (error) {
    console.error("Dashboard entries could not be loaded:", error.message);
    return res.status(500).json({ error: "Customer entries could not be loaded." });
  }
});

const buildDirectory = path.join(__dirname, "..", "build");
app.use(express.static(buildDirectory, { index: false }));
app.get("*", (_req, res) => res.sendFile(path.join(buildDirectory, "index.html")));

async function start() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
    throw new Error("SESSION_SECRET must be at least 32 characters.");
  }
  await pool.query(
    "CREATE TABLE IF NOT EXISTS customer_orders (" +
    "id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, " +
    "created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), " +
    "customer_name VARCHAR(100) NOT NULL, phone CHAR(10) NOT NULL, " +
    "delivery_address VARCHAR(500) NOT NULL, postal_code CHAR(6) NOT NULL, " +
    "order_type VARCHAR(20) NOT NULL CHECK (order_type IN ('product', 'subscription')), " +
    "items JSONB NOT NULL, total_rupees INTEGER NOT NULL CHECK (total_rupees > 0), " +
    "payment_method VARCHAR(20) NOT NULL CHECK (payment_method IN ('upi', 'card', 'emi', 'netbanking', 'cod')), " +
    "consented_at TIMESTAMPTZ NOT NULL)"
  );
  await pool.query(
    "CREATE TABLE IF NOT EXISTS customer_accounts (" +
    "id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, " +
    "phone CHAR(10) UNIQUE, email VARCHAR(254) UNIQUE, username VARCHAR(32), password_hash TEXT, full_name VARCHAR(100), " +
    "delivery_address VARCHAR(500), postal_code CHAR(6), " +
    "created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())"
  );
  await pool.query("ALTER TABLE customer_accounts ALTER COLUMN phone DROP NOT NULL");
  await pool.query("ALTER TABLE customer_accounts ADD COLUMN IF NOT EXISTS username VARCHAR(32)");
  await pool.query("ALTER TABLE customer_accounts ADD COLUMN IF NOT EXISTS password_hash TEXT");
  await pool.query("CREATE UNIQUE INDEX IF NOT EXISTS customer_accounts_username_ci_idx ON customer_accounts (LOWER(username)) WHERE username IS NOT NULL");
  await pool.query("ALTER TABLE customer_accounts ADD COLUMN IF NOT EXISTS email VARCHAR(254) UNIQUE");
  await pool.query(
    "ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS customer_id BIGINT REFERENCES customer_accounts(id) ON DELETE SET NULL"
  );
  await pool.query(
    "CREATE TABLE IF NOT EXISTS customer_subscription_days (" +
    "id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, " +
    "customer_id BIGINT NOT NULL REFERENCES customer_accounts(id) ON DELETE CASCADE, " +
    "delivery_date DATE NOT NULL, status VARCHAR(3) NOT NULL CHECK (status IN ('on', 'off')), " +
    "items JSONB NOT NULL DEFAULT '[]'::jsonb, total_rupees INTEGER NOT NULL DEFAULT 0 CHECK (total_rupees >= 0), " +
    "created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), " +
    "UNIQUE (customer_id, delivery_date))"
  );
  await pool.query("CREATE INDEX IF NOT EXISTS customer_subscription_days_account_idx ON customer_subscription_days (customer_id, delivery_date)");
  await pool.query(
    "CREATE TABLE IF NOT EXISTS customer_daily_orders (" +
    "id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, " +
    "customer_id BIGINT NOT NULL REFERENCES customer_accounts(id) ON DELETE CASCADE, " +
    "product_id INTEGER NOT NULL, product_name VARCHAR(120) NOT NULL, size VARCHAR(20) NOT NULL, " +
    "quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 99), is_active BOOLEAN NOT NULL DEFAULT TRUE, " +
    "created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())"
  );
  await pool.query("CREATE INDEX IF NOT EXISTS customer_orders_recent_idx ON customer_orders (created_at DESC, id DESC)");
  await pool.query("CREATE INDEX IF NOT EXISTS customer_orders_account_recent_idx ON customer_orders (customer_id, created_at DESC, id DESC)");
  await pool.query("CREATE INDEX IF NOT EXISTS customer_daily_orders_account_idx ON customer_daily_orders (customer_id, created_at ASC, id ASC)");
  app.listen(port, "0.0.0.0", () => console.log("Royal Hill server listening on port " + port));
}

start().catch((error) => {
  console.error("Server startup failed:", error.message);
  process.exit(1);
});
