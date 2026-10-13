
const express = require("express");
const cron = require("node-cron");
const QRCode = require("qrcode");
const crypto = require("crypto");
const path = require("path");
const fs = require("fs");

const app = express();

app.disable("x-powered-by");
app.use(express.json());

const PORT = Number(process.env.PORT || 3000);
const KEY = process.env.GATEWAY_API_KEY || "";
const UPI = process.env.UPI_ID || "";
const PAYEE = process.env.UPI_PAYEE_NAME || "MrKrishna Gateway";

const ORDERS_FILE = path.join(__dirname, "orders.json");
const TEMP_FILE = ORDERS_FILE + ".tmp";

// Create local JSON file automatically.
if (!fs.existsSync(ORDERS_FILE)) {
  fs.writeFileSync(ORDERS_FILE, "{}\n", "utf8");
}

// Load orders into memory when the server starts.
let orders;

try {
  orders = JSON.parse(fs.readFileSync(ORDERS_FILE, "utf8"));
  if (!orders || Array.isArray(orders) || typeof orders !== "object") {
    throw new Error("Invalid orders.json format");
  }
} catch (err) {
  console.error("Cannot load orders.json:", err.message);
  process.exit(1);
}

// Persist changes atomically to a local file.
// No database or external storage service is used.
function saveOrders() {
  fs.writeFileSync(TEMP_FILE, JSON.stringify(orders, null, 2) + "\n");
  fs.renameSync(TEMP_FILE, ORDERS_FILE);
}

function orderId() {
  const d = new Date();
  const date =
    String(d.getFullYear()).slice(-2) +
    String(d.getMonth() + 1).padStart(2, "0") +
    String(d.getDate()).padStart(2, "0");

  let id;

  do {
    id =
      "ORD" +
      date +
      Array.from(
        crypto.randomBytes(6),
        (b) => "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"[b % 36]
      ).join("");
  } while (orders[id]);

  return id;
}

function paymentUri(id, amount) {
  return (
    "upi://pay?" +
    new URLSearchParams({
      pa: UPI,
      pn: PAYEE,
      am: amount.toFixed(2),
      cu: "INR",
      tn: id,
      tr: id,
      tid: id
    }).toString()
  );
}

function publicOrder(order) {
  return {
    order_id: order.order_id,
    amount: order.amount,
    status: order.status,
    created_at: order.created_at,
    updated_at: order.updated_at,
    verified_at: order.verified_at || null,
    transaction_id: order.transaction_id || null
  };
}

function esc(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[c]);
}

function shell(title, body, script = "") {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#0b1020">
<title>${esc(title)} | MrKrishna Gateway</title>
<style>
:root{color-scheme:dark;--line:#29344a;--muted:#aab4c7}
*{box-sizing:border-box}
body{margin:0;background:radial-gradient(ellipse at top,#211747,#080b14 55%);font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#f5f7fb;min-height:100vh}
header{display:flex;align-items:center;gap:12px;padding:20px max(20px,calc((100vw - 1000px)/2));border-bottom:1px solid #ffffff12}
.mark{width:38px;height:38px;border-radius:12px;background:linear-gradient(135deg,#a78bfa,#6d28d9);display:grid;place-items:center;font-weight:900}
.brand{font-weight:850;letter-spacing:-.03em}
.brand small{display:block;color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.13em}
main{width:min(100% - 32px,550px);margin:42px auto}
.card{background:#111827f2;border:1px solid var(--line);border-radius:24px;padding:clamp(22px,5vw,34px);box-shadow:0 24px 80px #0005}
.center{text-align:center}
.eyebrow{color:#c4b5fd;font-size:12px;text-transform:uppercase;letter-spacing:.15em;font-weight:800}
.title{font-size:clamp(26px,6vw,34px);letter-spacing:-.04em;margin:10px 0}
.muted{color:var(--muted);line-height:1.6}
.amount{font-size:42px;font-weight:900;letter-spacing:-.05em;margin:10px 0}
.qr{background:#fff;border-radius:18px;padding:12px;width:max-content;max-width:100%;margin:22px auto}
.qr img{display:block;width:230px;height:230px;max-width:100%}
.status{border-radius:13px;padding:14px;margin:18px 0;font-weight:750;background:#312e8144;color:#c4b5fd;border:1px solid #8b5cf655}
.success{background:#064e3b55;color:#6ee7b7;border-color:#10b98155}
.failed{background:#88133744;color:#fda4af;border-color:#fb718555}
.btn{width:100%;border:0;border-radius:13px;padding:15px;font-size:15px;font-weight:850;cursor:pointer;color:white;background:linear-gradient(135deg,#8b5cf6,#6d28d9);margin-top:12px}
.btn:disabled{opacity:.6}
.field{width:100%;background:#0b1020;border:1px solid var(--line);border-radius:12px;color:white;padding:14px;font-size:16px;margin-top:8px}
.detail{display:flex;justify-content:space-between;gap:12px;border-top:1px solid var(--line);padding:12px 0;font-size:13px}
.detail span:first-child{color:var(--muted)}
.detail span:last-child{text-align:right;overflow-wrap:anywhere}
.note,.footer{font-size:12px;color:#8994a8;line-height:1.55}
.footer{text-align:center;margin-top:22px}
</style>
</head>
<body>
<header>
<div class="mark">MK</div>
<div class="brand">MrKrishna Gateway<small>UPI payments</small></div>
</header>
<main>${body}<div class="footer">MrKrishna Gateway · Payment status</div></main>
${script}
</body>
</html>`;
}

function page(order) {
  if (order.status === "success") {
    return shell("Payment Successful", `
<section class="card center">
<div class="status success">✓ Payment Successful</div>
<div class="eyebrow">Payment confirmed</div>
<h1 class="title">Thank you!</h1>
<p class="muted">This order is marked as paid. Its QR code is no longer available.</p>
<div class="amount">₹${order.amount.toFixed(2)}</div>
<div class="detail"><span>Order ID</span><span>${esc(order.order_id)}</span></div>
</section>`);
  }

  if (order.status === "failed") {
    return shell("Payment Failed", `
<section class="card center">
<div class="status failed">✕ Payment Failed</div>
<h1 class="title">Payment failed</h1>
<p class="muted">This order is closed and its QR code is no longer available.</p>
<div class="amount">₹${order.amount.toFixed(2)}</div>
<div class="detail"><span>Order ID</span><span>${esc(order.order_id)}</span></div>
</section>`);
  }

  return shell("Pay ₹" + order.amount, `
<section class="card center">
<div class="eyebrow">UPI payment request</div>
<h1 class="title">Complete your payment</h1>
<p class="muted">Scan this QR code using your UPI app.</p>
<div class="amount">₹${order.amount.toFixed(2)}</div>
<div class="qr">
<img src="/qr/${encodeURIComponent(order.order_id)}.png" alt="UPI payment QR">
</div>
<div class="status" id="status" aria-live="polite">Payment not confirmed yet</div>
<button class="btn" id="check">Check Payment</button>
<p class="note">After paying, tap Check Payment. You can return to this same link later.</p>
<div class="detail"><span>Payee</span><span>${esc(order.payee_name)}</span></div>
<div class="detail"><span>Order ID</span><span>${esc(order.order_id)}</span></div>
</section>`, `
<script>
const b = document.getElementById("check");
const s = document.getElementById("status");

b.onclick = async () => {
  b.disabled = true;
  b.textContent = "Checking payment…";
  s.textContent = "Checking gateway status…";

  try {
    const r = await fetch("/api/check/${encodeURIComponent(order.order_id)}", {
      method: "POST"
    });
    const d = await r.json();

    if (d.order && ["success", "failed"].includes(d.order.status)) {
      location.reload();
      return;
    }

    s.textContent = d.error
      ? "Could not check payment. Please retry."
      : "Payment not confirmed yet. You can try again.";
  } catch {
    s.textContent = "Network error. Please retry.";
  } finally {
    b.disabled = false;
    b.textContent = "Check Payment";
  }
};
</script>`);
}

// Check the external gateway. Errors and unknown statuses remain pending.
async function verify(id) {
  if (!KEY) throw new Error("Gateway API key is not configured");

  const order = orders[id];
  if (!order) {
    const err = new Error("Order not found");
    err.code = 404;
    throw err;
  }

  if (["success", "failed"].includes(order.status)) {
    return { order: publicOrder(order), alreadyTerminal: true };
  }

  const url = new URL("https://vcgatewaypro.com/payment_api.php");
  url.searchParams.set("api_key", KEY);
  url.searchParams.set("order_id", order.order_id);
  url.searchParams.set("amount", String(order.amount));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);

  let response;
  let body;

  try {
    response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json, text/plain" }
    });
    body = await response.text();
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    return {
      order: publicOrder(order),
      error: "Gateway HTTP error; order remains pending"
    };
  }

  let parsed = null;
  let gatewayStatus = "";

  try {
    parsed = JSON.parse(body);
    gatewayStatus = String(parsed.status || "").trim().toLowerCase();
  } catch {
    // Unexpected response: do not mark the order as failed.
  }

  let nextStatus = order.status;

  if (gatewayStatus === "success") nextStatus = "success";
  else if (gatewayStatus === "failed") nextStatus = "failed";

  const now = new Date().toISOString();

  order.status = nextStatus;
  order.gateway_status = gatewayStatus || "unknown";
  order.gateway_response = body.slice(0, 4000);
  order.updated_at = now;
  order.verified_at = now;

  if (parsed) {
    const tx = parsed.transaction_id || parsed.transactionId || parsed.txn_id;
    if (tx != null) order.transaction_id = String(tx);
  }

  saveOrders();

  return {
    order: publicOrder(order),
    checked: true,
    gateway_result: gatewayStatus || "unknown"
  };
}

// Home page: create a payment link.
app.get("/", (req, res) => {
  res.type("html").send(shell("Create payment link", `
<section class="card">
<div class="eyebrow">Payment link generator</div>
<h1 class="title">Create a UPI payment link</h1>
<p class="muted">Enter an INR amount to generate a unique order and QR page.</p>
<form action="/link" method="get">
<label class="muted" for="value">Amount (₹)</label>
<input class="field" id="value" name="value" type="number" min="0.01" max="100000" step="0.01" placeholder="10.00" required>
<button class="btn" type="submit">Create payment link</button>
</form>
</section>`));
});

// Generate order and redirect to its payment page.
app.get("/link", (req, res) => {
  const raw = String(req.query.value ?? "");
  const amount = Number(raw);

  if (
    !raw ||
    !Number.isFinite(amount) ||
    amount <= 0 ||
    amount > 100000 ||
    Math.round(amount * 100) !== amount * 100
  ) {
    return res.status(400).send(
      "Invalid amount. Use /link?value=10 (₹0.01–₹100000)."
    );
  }

  if (!UPI || !UPI.includes("@")) {
    return res.status(503).send("UPI_ID is not configured.");
  }

  const id = orderId();
  const now = new Date().toISOString();

  orders[id] = {
    order_id: id,
    amount,
    upi_id: UPI,
    payee_name: PAYEE,
    payment_uri: paymentUri(id, amount),
    status: "pending",
    gateway_status: null,
    gateway_response: null,
    created_at: now,
    updated_at: now,
    verified_at: null,
    transaction_id: null
  };

  try {
    saveOrders();
  } catch (err) {
    delete orders[id];
    console.error("Failed to save order:", err.message);
    return res.status(500).send("Could not create order. Please retry.");
  }

  res.set("Cache-Control", "no-store");
  res.redirect(303, "/pay/" + encodeURIComponent(id));
});

// Payment page.
app.get("/pay/:id", (req, res) => {
  const order = orders[String(req.params.id)];

  if (!order) {
    return res.status(404).type("html").send(
      shell("Order not found", `
<section class="card center">
<h1 class="title">Order not found</h1>
<p class="muted">This payment link is invalid or its local record is missing.</p>
</section>`)
    );
  }

  res.set("Cache-Control", "no-store");
  res.type("html").send(page(order));
});

// Generate QR locally; no third-party QR service is required.
app.get("/qr/:id.png", async (req, res) => {
  const order = orders[String(req.params.id)];

  if (!order || order.status !== "pending") {
    return res.status(404).send("QR unavailable");
  }

  try {
    res.set("Cache-Control", "no-store");
    res.type("png").send(
      await QRCode.toBuffer(order.payment_uri, {
        width: 320,
        margin: 2,
        errorCorrectionLevel: "M"
      })
    );
  } catch (err) {
    console.error("QR generation failed:", err.message);
    res.status(500).send("QR generation failed");
  }
});

// Manual gateway verification.
app.post("/api/check/:id", async (req, res) => {
  try {
    res.set("Cache-Control", "no-store");
    res.json(await verify(String(req.params.id)));
  } catch (err) {
    res.status(err.code || 502).json({
      error: err.code === 404 ? "Order not found" : "Could not verify payment"
    });
  }
});

// Local lookup only. This route never calls the gateway.
app.get("/cheque", (req, res) => {
  const id = String(req.query.value ?? "").trim();

  if (!id) {
    return res.status(400).json({
      error: "Use /cheque?value=ORDER_ID"
    });
  }

  const order = orders[id];

  if (!order) {
    return res.status(404).json({
      error: "Order not found",
      order_id: id
    });
  }

  res.set("Cache-Control", "no-store");
  res.json(publicOrder(order));
});

app.get("/health", (req, res) => {
  res.json({ ok: true, storage: "local-json-file" });
});

// Automatic verification every 15 minutes while the process is running.
let checking = false;

cron.schedule("*/15 * * * *", async () => {
  if (checking) return;
  checking = true;

  try {
    const pendingIds = Object.values(orders)
      .filter((order) => order.status === "pending")
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .slice(0, 100)
      .map((order) => order.order_id);

    for (const id of pendingIds) {
      try {
        await verify(id);
      } catch (err) {
        console.error("Scheduled verification failed:", id, err.message);
      }
    }
  } finally {
    checking = false;
  }
});

app.listen(PORT, () => {
  console.log("MrKrishna Gateway listening on port " + PORT);
  console.log("Local order file: " + ORDERS_FILE);

  if (!KEY) console.warn("GATEWAY_API_KEY is not configured");
  if (!UPI) console.warn("UPI_ID is not configured");
});
