import jwt from "jsonwebtoken";
import { HttpError } from "../http.js";

export function authRequired(secret) {
  return (req, _res, next) => {
    const header = req.headers.authorization || "";
    const [scheme, token] = header.split(" ");
    if (scheme !== "Bearer" || !token) {
      return next(new HttpError(401, "Token tidak ditemukan"));
    }
    try {
      req.user = jwt.verify(token, secret);
      return next();
    } catch {
      return next(new HttpError(401, "Token tidak valid atau kedaluwarsa"));
    }
  };
}
