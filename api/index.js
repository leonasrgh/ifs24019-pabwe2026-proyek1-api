// Entry point untuk Vercel (serverless). Untuk server biasa pakai src/server.js.
import bcrypt from "bcryptjs";
import { openDb } from "../src/db.js";
import { createApp } from "../src/app.js";

const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) throw new Error("JWT_SECRET belum diisi di Environment Variables");

// Filesystem Vercel hanya bisa ditulis di /tmp dan BERSIFAT SEMENTARA.
const db = openDb(process.env.DB_PATH || "/tmp/nebengkampus.db");

// Akun awal otomatis (dibuat ulang tiap instance baru), agar login tetap bisa
// walau database sementara terhapus.
// Login memakai akun lokal; bila tidak ada, dicoba ke Delcom Open API (email + password).
const { SEED_USERNAME, SEED_PASSWORD } = process.env;
if (SEED_USERNAME && SEED_PASSWORD) {
  db.prepare(
    "INSERT OR IGNORE INTO users (name, username, password_hash) VALUES (?,?,?)",
  ).run(SEED_USERNAME, SEED_USERNAME.toLowerCase(), bcrypt.hashSync(SEED_PASSWORD, 8));
}

export default createApp(db, { jwtSecret, corsOrigin: process.env.CORS_ORIGIN || "*" });
