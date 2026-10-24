import { openDb } from "./db.js";
import { createApp } from "./app.js";

const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) {
  console.error("JWT_SECRET wajib diisi");
  process.exit(1);
}

const db = openDb(process.env.DB_PATH || "./nebengkampus.db");
const app = createApp(db, { jwtSecret, corsOrigin: process.env.CORS_ORIGIN || "*" });
const port = Number(process.env.PORT) || 8000;
app.listen(port, () => console.log(`NebengKampus API berjalan di :${port}`));
