import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { HttpError, ok, requireFields, wrap } from "../http.js";

// Login ke Delcom Open API (akun Delcom = email + password).
export async function delcomLoginDefault(email, password) {
  try {
    const base = process.env.DELCOM_BASEURL || "https://open-api.delcom.org/api/v1";
    const res = await fetch(`${base}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json?.data?.user ? { name: json.data.user.name } : null;
  } catch {
    return null;
  }
}

export function authRoutes(db, secret, delcomLogin = delcomLoginDefault) {
  const r = Router();

  r.post(
    "/register",
    wrap((req, res) => {
      requireFields(req.body, ["name", "username", "password"]);
      const { name, username, password, phone } = req.body;
      if (String(password).length < 6) {
        throw new HttpError(400, "Password minimal 6 karakter");
      }
      const uname = String(username).trim().toLowerCase();
      if (db.prepare("SELECT 1 FROM users WHERE username = ?").get(uname)) {
        throw new HttpError(409, "Username sudah digunakan");
      }
      const hash = bcrypt.hashSync(String(password), 8);
      const info = db
        .prepare("INSERT INTO users (name, username, password_hash, phone) VALUES (?,?,?,?)")
        .run(String(name).trim(), uname, hash, phone ? String(phone).trim() : null);
      ok(res, { id: Number(info.lastInsertRowid) }, "Registrasi berhasil", 201);
    }),
  );

  r.post(
    "/login",
    wrap(async (req, res) => {
      requireFields(req.body, ["username", "password"]);
      const password = String(req.body.password);
      const uname = String(req.body.username).trim().toLowerCase();
      let user = db.prepare("SELECT * FROM users WHERE username = ?").get(uname);
      if (!user || !bcrypt.compareSync(password, user.password_hash)) {
        // Cadangan: akun Delcom (username diisi email Delcom). Dibuat/diperbarui lokal.
        const dc = await delcomLogin(uname, password);
        if (!dc) throw new HttpError(401, "Username atau password salah");
        const hash = bcrypt.hashSync(password, 8);
        if (user) {
          db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hash, user.id);
        } else {
          db.prepare("INSERT INTO users (name, username, password_hash) VALUES (?,?,?)").run(
            dc.name || uname,
            uname,
            hash,
          );
          user = db.prepare("SELECT * FROM users WHERE username = ?").get(uname);
        }
      }
      const token = jwt.sign({ id: user.id, username: user.username }, secret, { expiresIn: "7d" });
      ok(res, { token }, "Login berhasil");
    }),
  );

  return r;
}
