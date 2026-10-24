import { Router } from "express";
import { HttpError, ok, wrap } from "../http.js";

export function userRoutes(db) {
  const r = Router();

  r.get(
    "/me",
    wrap((req, res) => {
      const u = db
        .prepare("SELECT id, name, username, phone, created_at FROM users WHERE id = ?")
        .get(req.user.id);
      if (!u) throw new HttpError(404, "Pengguna tidak ditemukan");
      const stat = db
        .prepare(
          `SELECT ROUND(AVG(b.rating), 2) AS rating_avg, COUNT(b.rating) AS rating_count
           FROM bookings b JOIN rides r ON r.id = b.ride_id
           WHERE r.driver_id = ? AND b.rating IS NOT NULL`,
        )
        .get(req.user.id);
      ok(res, { ...u, rating_avg: stat.rating_avg, rating_count: stat.rating_count });
    }),
  );

  return r;
}
