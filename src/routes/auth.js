import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { HttpError, ok, requireFields, wrap } from "../http.js";

export function authRoutes(db, secret) {
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
    wrap((req, res) => {
      requireFields(req.body, ["username", "password"]);
      const uname = String(req.body.username).trim().toLowerCase();
      const user = db.prepare("SELECT * FROM users WHERE username = ?").get(uname);
      if (!user || !bcrypt.compareSync(String(req.body.password), user.password_hash)) {
        throw new HttpError(401, "Username atau password salah");
      }
      const token = jwt.sign({ id: user.id, username: user.username }, secret, { expiresIn: "7d" });
      ok(res, { token }, "Login berhasil");
    }),
  );

  return r;
}
