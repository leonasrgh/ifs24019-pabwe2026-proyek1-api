import express from "express";
import cors from "cors";
import { authRequired } from "./middleware/auth.js";
import { authRoutes } from "./routes/auth.js";
import { userRoutes } from "./routes/users.js";
import { rideRoutes } from "./routes/rides.js";
import { bookingRoutes } from "./routes/bookings.js";

export function createApp(db, { jwtSecret, corsOrigin = "*", delcomLogin }) {
  const app = express();
  app.use(cors({ origin: corsOrigin === "*" ? true : corsOrigin.split(",") }));
  app.use(express.json());

  app.get("/api/health", (_req, res) => res.json({ success: true, message: "NebengKampus API OK" }));

  const guard = authRequired(jwtSecret);
  app.use("/api/auth", authRoutes(db, jwtSecret, delcomLogin));
  app.use("/api/users", guard, userRoutes(db));
  app.use("/api/rides", guard, rideRoutes(db));
  app.use("/api/bookings", guard, bookingRoutes(db));

  app.use((_req, res) => res.status(404).json({ success: false, message: "Endpoint tidak ditemukan" }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err.type === "entity.parse.failed") {
      return res.status(400).json({ success: false, message: "JSON tidak valid" });
    }
    const status = err.status || 500;
    res.status(status).json({ success: false, message: status === 500 ? "Kesalahan server" : err.message });
  });

  return app;
}
