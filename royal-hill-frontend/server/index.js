const crypto = require("node:crypto");
const path = require("node:path");
const express = require("express");
const helmet = require("helmet");
const { Pool } = require("pg");

const app = express();
const port = Number(process.env.PORT || 5000);
const sessionCookie = "royal_hill_admin";
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
      "(customer_name, phone, delivery_address, postal_code, order_type, items, total_rupees, payment_method, consented_at) " +
      "VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, NOW()) RETURNING id, created_at",
      [
        req.body.customer.name.trim(),
        req.body.customer.phone,
        req.body.customer.address.trim(),
        req.body.customer.pin,
        orderType,
        JSON.stringify(calculated.items),
        calculated.total,
        req.body.paymentMethod,
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
  await pool.query("CREATE INDEX IF NOT EXISTS customer_orders_recent_idx ON customer_orders (created_at DESC, id DESC)");
  app.listen(port, "0.0.0.0", () => console.log("Royal Hill server listening on port " + port));
}

start().catch((error) => {
  console.error("Server startup failed:", error.message);
  process.exit(1);
});
