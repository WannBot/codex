/**
 * Shopee WA Gateway — Key License Server
 * Node.js + Express + SQLite
 * Port: 3000
 */
 
 require('dotenv').config();

const express    = require("express");
const cors       = require("cors");
const path       = require("path");
const crypto     = require("crypto");
const Database   = require("better-sqlite3");

/* ─── Config ─── */
const PORT       = process.env.PORT || 4000;
const HOST       = "0.0.0.0";
const ADMIN_PASS = process.env.ADMIN_PASS || "admin123"; // ganti via env variable!
const DB_PATH    = path.join(__dirname, "db", "keys.db");

/* ─── DB Init ─── */
const db = new Database(DB_PATH);
db.exec(`
  CREATE TABLE IF NOT EXISTS license_keys (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    key_code    TEXT UNIQUE NOT NULL,
    label       TEXT DEFAULT '',
    duration_type TEXT NOT NULL,   -- 'minute' | 'day' | 'month'
    duration_val  INTEGER NOT NULL,
    created_at  INTEGER NOT NULL,
    expires_at  INTEGER NOT NULL,
    activated_at INTEGER DEFAULT NULL,
    is_active   INTEGER DEFAULT 1,
    note        TEXT DEFAULT ''
  );
`);

/* ─── App ─── */
const app = express();
app.use(cors({ origin: "*" }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

/* ════════════════════════════════════════
   HELPERS
════════════════════════════════════════ */
function generateKey() {
  const seg = () => crypto.randomBytes(3).toString("hex").toUpperCase();
  return `SKPRO-${seg()}-${seg()}-${seg()}`;
}

function calcExpiresAt(durationVal, durationType) {
  const now = Date.now();
  let ms = 0;
  if (durationType === "minute") ms = durationVal * 60 * 1000;
  else if (durationType === "day")    ms = durationVal * 24 * 60 * 60 * 1000;
  else if (durationType === "month")  ms = durationVal * 30 * 24 * 60 * 60 * 1000;
  return now + ms;
}

function formatMs(ms) {
  const s = Math.floor(ms / 1000);
  if (s < 3600)   return `${Math.floor(s/60)} menit`;
  if (s < 86400)  return `${Math.floor(s/3600)} jam`;
  if (s < 2592000) return `${Math.floor(s/86400)} hari`;
  return `${Math.floor(s/2592000)} bulan`;
}

function adminGuard(req, res, next) {
  const pass = req.headers["x-admin-pass"] || req.body?.admin_pass;
  if (pass !== ADMIN_PASS) {
    return res.status(401).json({ success: false, message: "Admin password salah." });
  }
  next();
}

/* ════════════════════════════════════════
   PUBLIC API — Extension validation
════════════════════════════════════════ */

// POST /api/validate  { key: "SKPRO-..." }
app.post("/api/validate", (req, res) => {
  const { key } = req.body || {};
  if (!key || typeof key !== "string") {
    return res.json({ valid: false, message: "Key tidak diberikan." });
  }

  const row = db.prepare("SELECT * FROM license_keys WHERE key_code = ?").get(key.trim().toUpperCase());

  if (!row) {
    return res.json({ valid: false, message: "Key tidak ditemukan.", deleted: true });
  }
  if (!row.is_active) {
    return res.json({ valid: false, message: "Key sudah dinonaktifkan." });
  }

  const now = Date.now();
  if (now > row.expires_at) {
    return res.json({ valid: false, message: "Key sudah kadaluarsa.", expired: true });
  }

  // Mark first activation
  if (!row.activated_at) {
    db.prepare("UPDATE license_keys SET activated_at = ? WHERE id = ?").run(now, row.id);
  }

  const remaining = row.expires_at - now;

  return res.json({
    valid:      true,
    message:    "Key valid.",
    key:        row.key_code,
    label:      row.label,
    expiresAt:  row.expires_at,
    remaining:  formatMs(remaining),
    remainingMs: remaining,
  });
});

/* ════════════════════════════════════════
   ADMIN API — protected by x-admin-pass header
════════════════════════════════════════ */

// POST /api/admin/generate
app.post("/api/admin/generate", adminGuard, (req, res) => {
  const { duration_val, duration_type, label = "", note = "", count = 1 } = req.body || {};

  if (!duration_val || !duration_type) {
    return res.status(400).json({ success: false, message: "Isi duration_val dan duration_type." });
  }
  if (!["minute", "day", "month"].includes(duration_type)) {
    return res.status(400).json({ success: false, message: "duration_type harus: minute | day | month" });
  }

  const qty = Math.max(1, Math.min(Number(count) || 1, 100));
  const keys = [];
  const stmt = db.prepare(
    "INSERT INTO license_keys (key_code, label, duration_type, duration_val, created_at, expires_at, note) VALUES (?,?,?,?,?,?,?)"
  );

  for (let i = 0; i < qty; i++) {
    let key_code, tries = 0;
    do {
      key_code = generateKey();
      tries++;
    } while (db.prepare("SELECT 1 FROM license_keys WHERE key_code=?").get(key_code) && tries < 10);

    const now      = Date.now();
    const expires  = calcExpiresAt(Number(duration_val), duration_type);
    stmt.run(key_code, label, duration_type, Number(duration_val), now, expires, note);
    keys.push(key_code);
  }

  return res.json({ success: true, keys });
});

// GET /api/admin/keys?page=1&limit=50
app.get("/api/admin/keys", adminGuard, (req, res) => {
  const page  = Math.max(1, parseInt(req.query.page  || "1"));
  const limit = Math.min(100, parseInt(req.query.limit || "50"));
  const off   = (page - 1) * limit;
  const search = (req.query.search || "").trim();

  let whereClause = "";
  let params = [];
  if (search) {
    whereClause = "WHERE key_code LIKE ? OR label LIKE ? OR note LIKE ?";
    const s = `%${search}%`;
    params = [s, s, s];
  }

  const total = db.prepare(`SELECT COUNT(*) as n FROM license_keys ${whereClause}`).get(...params).n;
  const rows  = db.prepare(
    `SELECT * FROM license_keys ${whereClause} ORDER BY id DESC LIMIT ? OFFSET ?`
  ).all(...params, limit, off);

  const now = Date.now();
  const enriched = rows.map(r => ({
    ...r,
    status: !r.is_active ? "nonaktif"
           : now > r.expires_at ? "kadaluarsa"
           : "aktif",
    remaining: now < r.expires_at ? formatMs(r.expires_at - now) : "—",
    created_at_fmt: new Date(r.created_at).toLocaleDateString("id-ID", { day:"2-digit", month:"short", year:"numeric" }),
    expires_at_fmt: new Date(r.expires_at).toLocaleString("id-ID", { day:"2-digit", month:"short", year:"numeric", hour:"2-digit", minute:"2-digit" }),
  }));

  return res.json({ success: true, total, page, limit, keys: enriched });
});

// DELETE /api/admin/keys/:id
app.delete("/api/admin/keys/:id", adminGuard, (req, res) => {
  db.prepare("UPDATE license_keys SET is_active = 0 WHERE id = ?").run(req.params.id);
  return res.json({ success: true });
});

// POST /api/admin/keys/:id/revoke  (toggle active)
app.post("/api/admin/keys/:id/revoke", adminGuard, (req, res) => {
  const row = db.prepare("SELECT is_active FROM license_keys WHERE id=?").get(req.params.id);
  if (!row) return res.status(404).json({ success: false });
  db.prepare("UPDATE license_keys SET is_active = ? WHERE id = ?").run(row.is_active ? 0 : 1, req.params.id);
  return res.json({ success: true, is_active: !row.is_active });
});

// GET /api/admin/stats
app.get("/api/admin/stats", adminGuard, (req, res) => {
  const now    = Date.now();
  const total  = db.prepare("SELECT COUNT(*) as n FROM license_keys").get().n;
  const active = db.prepare("SELECT COUNT(*) as n FROM license_keys WHERE is_active=1 AND expires_at > ?").get(now).n;
  const expired= db.prepare("SELECT COUNT(*) as n FROM license_keys WHERE expires_at <= ?").get(now).n;
  const used   = db.prepare("SELECT COUNT(*) as n FROM license_keys WHERE activated_at IS NOT NULL").get().n;
  return res.json({ success: true, total, active, expired, used });
});

/* ─── SPA fallback ─── */
app.get("*", (_, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

/* ─── Start ─── */
app.listen(PORT, HOST, () => {
  console.log(`✅ Shopee KeyGen Server running on port ${PORT}`);
  console.log(`🔑 Admin password: ${ADMIN_PASS}`);
});

/* ── PATCH /api/admin/keys/:id — edit label, add duration, set status ── */
app.patch("/api/admin/keys/:id", adminGuard, (req, res) => {
  const { label, add_duration_val, add_duration_type, is_active } = req.body || {};
  const row = db.prepare("SELECT * FROM license_keys WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ success: false, message: "Key tidak ditemukan." });

  let newExpiresAt = row.expires_at;

  // Add duration if requested
  if (add_duration_val && Number(add_duration_val) > 0) {
    if (!["minute", "day", "month"].includes(add_duration_type)) {
      return res.status(400).json({ success: false, message: "add_duration_type tidak valid." });
    }
    // Perbaikan: base dari MAX(sekarang, expires_at) — jika key sudah expired, hitung dari SEKARANG
    const baseTime = Math.max(Date.now(), row.expires_at);
    const addMs    = calcExpiresAt(Number(add_duration_val), add_duration_type) - Date.now();
    newExpiresAt   = baseTime + addMs;
  }

  const newLabel    = (label !== undefined) ? String(label || "") : row.label;
  const newIsActive = (is_active !== undefined) ? (is_active ? 1 : 0) : row.is_active;

  db.prepare(
    "UPDATE license_keys SET label = ?, expires_at = ?, is_active = ? WHERE id = ?"
  ).run(newLabel, newExpiresAt, newIsActive, req.params.id);

  return res.json({ success: true });
});

/* ── DELETE /api/admin/keys/:id/permanent — hard delete ── */
app.delete("/api/admin/keys/:id/permanent", adminGuard, (req, res) => {
  db.prepare("DELETE FROM license_keys WHERE id = ?").run(req.params.id);
  return res.json({ success: true });
});
