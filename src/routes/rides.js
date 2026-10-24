import { Router } from "express";
import { HttpError, ok, requireFields, toInt, wrap } from "../http.js";

const RIDE_SELECT = `
  SELECT r.*, u.name AS driver_name,
         r.seats_total - COALESCE((SELECT SUM(seats) FROM bookings
                                   WHERE ride_id = r.id AND status = 'approved'), 0) AS seats_available
  FROM rides r JOIN users u ON u.id = r.driver_id`;

export function rideRoutes(db) {
  const r = Router();

  r.post(
    "/",
    wrap((req, res) => {
      requireFields(req.body, ["origin", "destination", "departure_time", "seats_total"]);
      const b = req.body;
      const when = new Date(b.departure_time);
      if (Number.isNaN(when.getTime())) throw new HttpError(400, "departure_time tidak valid");
      if (when.getTime() <= Date.now()) throw new HttpError(400, "Waktu keberangkatan harus di masa depan");
      const seats = toInt(b.seats_total, "seats_total", 1, 8);
      const price = toInt(b.price ?? 0, "price", 0);
      const info = db
        .prepare(
          `INSERT INTO rides (driver_id, origin, destination, departure_time, seats_total, price, notes)
           VALUES (?,?,?,?,?,?,?)`,
        )
        .run(
          req.user.id,
          String(b.origin).trim(),
          String(b.destination).trim(),
          when.toISOString(),
          seats,
          price,
          b.notes ? String(b.notes).trim() : null,
        );
      ok(res, { id: Number(info.lastInsertRowid) }, "Tumpangan dibuat", 201);
    }),
  );

  r.get(
    "/",
    wrap((req, res) => {
      const where = ["r.status = 'open'", "r.departure_time >= ?"];
      const args = [new Date().toISOString()];
      const { origin, destination, date } = req.query;
      if (origin) {
        where.push("LOWER(r.origin) LIKE ?");
        args.push(`%${String(origin).toLowerCase()}%`);
      }
      if (destination) {
        where.push("LOWER(r.destination) LIKE ?");
        args.push(`%${String(destination).toLowerCase()}%`);
      }
      if (date) {
        where.push("substr(r.departure_time, 1, 10) = ?");
        args.push(String(date));
      }
      const rows = db
        .prepare(`${RIDE_SELECT} WHERE ${where.join(" AND ")} ORDER BY r.departure_time ASC`)
        .all(...args)
        .filter((x) => x.seats_available > 0);
      ok(res, rows);
    }),
  );

  // Harus sebelum "/:id"
  r.get(
    "/mine",
    wrap((req, res) => {
      const rows = db
        .prepare(`${RIDE_SELECT} WHERE r.driver_id = ? ORDER BY r.departure_time DESC`)
        .all(req.user.id);
      ok(res, rows);
    }),
  );

  r.get(
    "/:id",
    wrap((req, res) => {
      const ride = db.prepare(`${RIDE_SELECT} WHERE r.id = ?`).get(req.params.id);
      if (!ride) throw new HttpError(404, "Tumpangan tidak ditemukan");
      const mine = ride.driver_id === req.user.id;
      const booking = db
        .prepare("SELECT * FROM bookings WHERE ride_id = ? AND passenger_id = ?")
        .get(ride.id, req.user.id);
      ok(res, { ...ride, is_driver: mine, my_booking: booking || null });
    }),
  );

  r.post(
    "/:id/complete",
    wrap((req, res) => {
      const ride = db.prepare("SELECT * FROM rides WHERE id = ?").get(req.params.id);
      if (!ride) throw new HttpError(404, "Tumpangan tidak ditemukan");
      if (ride.driver_id !== req.user.id) throw new HttpError(403, "Hanya pengemudi yang boleh menyelesaikan");
      if (ride.status !== "open") throw new HttpError(409, "Tumpangan sudah tidak aktif");
      db.exec("BEGIN");
      try {
        db.prepare("UPDATE rides SET status = 'completed' WHERE id = ?").run(ride.id);
        db.prepare("UPDATE bookings SET status = 'rejected' WHERE ride_id = ? AND status = 'pending'").run(ride.id);
        db.exec("COMMIT");
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
      ok(res, null, "Perjalanan selesai");
    }),
  );

  r.get(
    "/:id/bookings",
    wrap((req, res) => {
      const ride = db.prepare("SELECT * FROM rides WHERE id = ?").get(req.params.id);
      if (!ride) throw new HttpError(404, "Tumpangan tidak ditemukan");
      if (ride.driver_id !== req.user.id) throw new HttpError(403, "Hanya pengemudi yang boleh melihat pemesanan");
      const rows = db
        .prepare(
          `SELECT b.*, u.name AS passenger_name FROM bookings b
           JOIN users u ON u.id = b.passenger_id WHERE b.ride_id = ? ORDER BY b.created_at ASC`,
        )
        .all(ride.id);
      ok(res, rows);
    }),
  );

  r.post(
    "/:id/bookings",
    wrap((req, res) => {
      const ride = db.prepare(`${RIDE_SELECT} WHERE r.id = ?`).get(req.params.id);
      if (!ride) throw new HttpError(404, "Tumpangan tidak ditemukan");
      if (ride.driver_id === req.user.id) throw new HttpError(400, "Tidak bisa memesan tumpangan sendiri");
      if (ride.status !== "open") throw new HttpError(409, "Tumpangan sudah tidak aktif");
      const seats = toInt(req.body?.seats ?? 1, "seats", 1, 8);
      if (seats > ride.seats_available) throw new HttpError(409, "Kursi tidak mencukupi");
      if (db.prepare("SELECT 1 FROM bookings WHERE ride_id = ? AND passenger_id = ?").get(ride.id, req.user.id)) {
        throw new HttpError(409, "Anda sudah memesan tumpangan ini");
      }
      const info = db
        .prepare("INSERT INTO bookings (ride_id, passenger_id, seats) VALUES (?,?,?)")
        .run(ride.id, req.user.id, seats);
      ok(res, { id: Number(info.lastInsertRowid) }, "Pemesanan dikirim", 201);
    }),
  );

  return r;
}
