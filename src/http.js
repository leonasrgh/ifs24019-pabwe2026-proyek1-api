export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const ok = (res, data, message = "OK", status = 200) =>
  res.status(status).json({ success: true, message, data });

export function requireFields(body, fields) {
  for (const f of fields) {
    const v = body?.[f];
    if (v === undefined || v === null || String(v).trim() === "") {
      throw new HttpError(400, `Field '${f}' wajib diisi`);
    }
  }
}

export function toInt(value, field, min, max = Number.MAX_SAFE_INTEGER) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new HttpError(400, `Field '${field}' harus bilangan bulat ${min}-${max}`);
  }
  return n;
}

// Bungkus handler agar error sync/async masuk ke error middleware.
export const wrap = (fn) => (req, res, next) => {
  try {
    const out = fn(req, res);
    if (out && typeof out.catch === "function") out.catch(next);
  } catch (e) {
    next(e);
  }
};
