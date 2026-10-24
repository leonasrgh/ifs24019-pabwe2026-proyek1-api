import { Router } from "express";
import { HttpError, ok, toInt, wrap } from "../http.js";

const BOOKING_JOIN = `
  SELECT b.*, r.origin, r.destination, r.departure_time, r.price, r.status AS ride_status,
         u.name AS driver_name
  FROM bookings b JOIN rides r ON r.id = b.ride_id JOIN users u ON u.id = r.driver_id`;

export function bookingRoutes(db) {
  const r = Router();

  const load = (id) => {
    const b = db
      .prepare(
        `SELECT b.*, r.driver_id, r.seats_total, r.status AS ride_status FROM bookings b
         JOIN rides r ON r.id = b.ride_id WHERE b.id = ?`,
      )
      .get(id);
    if (!b) throw new HttpError(404, "Pemesanan tidak ditemukan");
    return b;
  };

  r.get(
    "/mine",
    wrap((req, res) => {
      const rows = db
        .prepare(`${BOOKING_JOIN} WHERE b.passenger_id = ? ORDER BY r.departure_time DESC`)
        .all(req.user.id);
      ok(res, rows);
    }),
  );

  // Pengemudi menyetujui / menolak
  r.patch(
    "/:id",
    wrap((req, res) => {
      const b = load(req.params.id);
      if (b.driver_id !== req.user.id) throw new HttpError(403, "Hanya pengemudi yang boleh memproses pemesanan");
      const status = req.body?.status;
      if (!["approved", "rejected"].includes(status)) {
        throw new HttpError(400, "status harus 'approved' atau 'rejected'");
      }
      if (b.status !== "pending") throw new HttpError(409, "Pemesanan sudah diproses");
      if (b.ride_status !== "open") throw new HttpError(409, "Tumpangan sudah tidak aktif");
      if (status === "approved") {
        const used = db
          .prepare("SELECT COALESCE(SUM(seats),0) AS n FROM bookings WHERE ride_id = ? AND status = 'approved'")
          .get(b.ride_id).n;
        if (used + b.seats > b.seats_total) throw new HttpError(409, "Kursi tidak mencukupi");
      }
      db.prepare("UPDATE bookings SET status = ? WHERE id = ?").run(status, b.id);
      ok(res, null, status === "approved" ? "Pemesanan disetujui" : "Pemesanan ditolak");
    }),
  );

  r.post(
    "/:id/cancel",
    wrap((req, res) => {
      const b = load(req.params.id);
      if (b.passenger_id !== req.user.id) throw new HttpError(403, "Bukan pemesanan Anda");
      if (!["pending", "approved"].includes(b.status) || b.ride_status !== "open") {
        throw new HttpError(409, "Pemesanan tidak bisa dibatalkan");
      }
      db.prepare("UPDATE bookings SET status = 'cancelled' WHERE id = ?").run(b.id);
      ok(res, null, "Pemesanan dibatalkan");
    }),
  );

  r.post(
    "/:id/rating",
    wrap((req, res) => {
      const b = load(req.params.id);
      if (b.passenger_id !== req.user.id) throw new HttpError(403, "Bukan pemesanan Anda");
      if (b.ride_status !== "completed" || b.status !== "approved") {
        throw new HttpError(409, "Rating hanya untuk perjalanan yang sudah selesai");
      }
      if (b.rating !== null) throw new HttpError(409, "Anda sudah memberi rating");
      const rating = toInt(req.body?.rating, "rating", 1, 5);
      const review = req.body?.review ? String(req.body.review).trim() : null;
      db.prepare("UPDATE bookings SET rating = ?, review = ? WHERE id = ?").run(rating, review, b.id);
      ok(res, null, "Terima kasih atas rating Anda");
    }),
  );

  return r;
}
