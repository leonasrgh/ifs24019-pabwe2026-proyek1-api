import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import { openDb } from "../src/db.js";
import { createApp } from "../src/app.js";
import { delcomLoginDefault } from "../src/routes/auth.js";
import { vi } from "vitest";

const SECRET = "test-secret";
let app;

const future = (days = 3) => new Date(Date.now() + days * 86400000).toISOString();

async function signup(username, name = username) {
  await request(app).post("/api/auth/register").send({ name, username, password: "secret1" });
  const res = await request(app).post("/api/auth/login").send({ username, password: "secret1" });
  return { Authorization: `Bearer ${res.body.data.token}` };
}

async function makeRide(h, over = {}) {
  const res = await request(app)
    .post("/api/rides")
    .set(h)
    .send({ origin: "Del", destination: "Balige", departure_time: future(), seats_total: 2, price: 5000, ...over });
  return res.body.data?.id;
}

beforeEach(() => {
  app = createApp(openDb(":memory:"), { jwtSecret: SECRET });
});

describe("infra", () => {
  it("health, 404, JSON rusak, CORS list", async () => {
    expect((await request(app).get("/api/health")).body.success).toBe(true);
    expect((await request(app).get("/nope")).status).toBe(404);
    const bad = await request(app).post("/api/auth/login").set("Content-Type", "application/json").send("{bad");
    expect(bad.status).toBe(400);
    const a2 = createApp(openDb(":memory:"), { jwtSecret: SECRET, corsOrigin: "http://a.com,http://b.com" });
    expect((await request(a2).get("/api/health")).status).toBe(200);
  });

  it("error 500 disamarkan", async () => {
    const db = openDb(":memory:");
    const a = createApp(db, { jwtSecret: SECRET });
    const res0 = await request(a).post("/api/auth/register").send({ name: "x", username: "x", password: "secret1" });
    expect(res0.status).toBe(201);
    const token = (await request(a).post("/api/auth/login").send({ username: "x", password: "secret1" })).body.data.token;
    db.exec("DROP TABLE bookings");
    const res = await request(a).get("/api/bookings/mine").set({ Authorization: `Bearer ${token}` });
    expect(res.status).toBe(500);
    expect(res.body.message).toBe("Kesalahan server");
  });
});

describe("auth", () => {
  it("register & login valid", async () => {
    const r = await request(app).post("/api/auth/register").send({ name: "A", username: " Alice ", password: "secret1", phone: "0812" });
    expect(r.status).toBe(201);
    const l = await request(app).post("/api/auth/login").send({ username: "ALICE", password: "secret1" });
    expect(l.body.data.token).toBeTruthy();
  });
  it("validasi register", async () => {
    expect((await request(app).post("/api/auth/register").send({ name: "A" })).status).toBe(400);
    expect((await request(app).post("/api/auth/register").send({ name: "A", username: "a", password: "123" })).status).toBe(400);
    await signup("dup");
    expect((await request(app).post("/api/auth/register").send({ name: "A", username: "dup", password: "secret1" })).status).toBe(409);
  });
  it("login gagal", async () => {
    await signup("bob");
    expect((await request(app).post("/api/auth/login").send({ username: "bob", password: "salah1" })).status).toBe(401);
    expect((await request(app).post("/api/auth/login").send({ username: "none", password: "secret1" })).status).toBe(401);
  });
  it("proteksi token", async () => {
    expect((await request(app).get("/api/rides")).status).toBe(401);
    expect((await request(app).get("/api/rides").set({ Authorization: "Bearer xxx" })).status).toBe(401);
  });
});

describe("users", () => {
  it("profil + rating pengemudi, user terhapus", async () => {
    const d = await signup("driver");
    const p = await signup("pass");
    const rid = await makeRide(d);
    const bid = (await request(app).post(`/api/rides/${rid}/bookings`).set(p).send({})).body.data.id;
    await request(app).patch(`/api/bookings/${bid}`).set(d).send({ status: "approved" });
    await request(app).post(`/api/rides/${rid}/complete`).set(d);
    await request(app).post(`/api/bookings/${bid}/rating`).set(p).send({ rating: 4, review: "ok" });
    const me = await request(app).get("/api/users/me").set(d);
    expect(me.body.data.rating_avg).toBe(4);
    expect(me.body.data.rating_count).toBe(1);
    const ghost = jwt.sign({ id: 999, username: "ghost" }, SECRET);
    expect((await request(app).get("/api/users/me").set({ Authorization: `Bearer ${ghost}` })).status).toBe(404);
  });
});

describe("rides", () => {
  it("buat & validasi", async () => {
    const h = await signup("d");
    const base = { origin: "A", destination: "B", departure_time: future(), seats_total: 2 };
    expect((await request(app).post("/api/rides").set(h).send({ origin: "A" })).status).toBe(400);
    expect((await request(app).post("/api/rides").set(h).send({ ...base, departure_time: "bukan" })).status).toBe(400);
    expect((await request(app).post("/api/rides").set(h).send({ ...base, departure_time: "2000-01-01" })).status).toBe(400);
    expect((await request(app).post("/api/rides").set(h).send({ ...base, seats_total: 0 })).status).toBe(400);
    expect((await request(app).post("/api/rides").set(h).send({ ...base, price: -1 })).status).toBe(400);
    expect((await request(app).post("/api/rides").set(h).send({ ...base, notes: " bawa helm " })).status).toBe(201);
    expect((await request(app).post("/api/rides").set(h).send(base)).status).toBe(201);
  });
  it("cari dengan filter, sembunyikan penuh", async () => {
    const d = await signup("d");
    const p = await signup("p");
    const when = future(5);
    const id1 = await makeRide(d, { departure_time: when, seats_total: 1 });
    await makeRide(d, { origin: "Laguboti", destination: "Siborongborong" });
    expect((await request(app).get("/api/rides").set(p)).body.data).toHaveLength(2);
    expect((await request(app).get("/api/rides?origin=lagu").set(p)).body.data).toHaveLength(1);
    expect((await request(app).get("/api/rides?destination=balige").set(p)).body.data).toHaveLength(1);
    expect((await request(app).get(`/api/rides?date=${when.slice(0, 10)}`).set(p)).body.data.length).toBeGreaterThanOrEqual(1);
    const bid = (await request(app).post(`/api/rides/${id1}/bookings`).set(p).send({})).body.data.id;
    await request(app).patch(`/api/bookings/${bid}`).set(d).send({ status: "approved" });
    expect((await request(app).get("/api/rides").set(p)).body.data).toHaveLength(1);
  });
  it("mine & detail", async () => {
    const d = await signup("d");
    const p = await signup("p");
    const id = await makeRide(d);
    expect((await request(app).get("/api/rides/mine").set(d)).body.data).toHaveLength(1);
    const det = await request(app).get(`/api/rides/${id}`).set(d);
    expect(det.body.data.is_driver).toBe(true);
    const det2 = await request(app).get(`/api/rides/${id}`).set(p);
    expect(det2.body.data.is_driver).toBe(false);
    expect(det2.body.data.my_booking).toBeNull();
    expect((await request(app).get("/api/rides/9999").set(p)).status).toBe(404);
  });
  it("pemesanan: validasi", async () => {
    const d = await signup("d");
    const p = await signup("p");
    const id = await makeRide(d);
    expect((await request(app).post("/api/rides/9999/bookings").set(p).send({})).status).toBe(404);
    expect((await request(app).post(`/api/rides/${id}/bookings`).set(d).send({})).status).toBe(400);
    expect((await request(app).post(`/api/rides/${id}/bookings`).set(p).send({ seats: 0 })).status).toBe(400);
    expect((await request(app).post(`/api/rides/${id}/bookings`).set(p).send({ seats: 3 })).status).toBe(409);
    expect((await request(app).post(`/api/rides/${id}/bookings`).set(p)).status).toBe(201);
    expect((await request(app).post(`/api/rides/${id}/bookings`).set(p).send({})).status).toBe(409);
    await request(app).post(`/api/rides/${id}/complete`).set(d);
    const q = await signup("q");
    expect((await request(app).post(`/api/rides/${id}/bookings`).set(q).send({})).status).toBe(409);
  });
  it("daftar pemesanan untuk pengemudi", async () => {
    const d = await signup("d");
    const p = await signup("p");
    const id = await makeRide(d);
    await request(app).post(`/api/rides/${id}/bookings`).set(p).send({});
    expect((await request(app).get(`/api/rides/${id}/bookings`).set(d)).body.data).toHaveLength(1);
    expect((await request(app).get(`/api/rides/${id}/bookings`).set(p)).status).toBe(403);
    expect((await request(app).get("/api/rides/9999/bookings").set(d)).status).toBe(404);
  });
  it("selesaikan: validasi", async () => {
    const d = await signup("d");
    const p = await signup("p");
    const id = await makeRide(d);
    expect((await request(app).post("/api/rides/9999/complete").set(d)).status).toBe(404);
    expect((await request(app).post(`/api/rides/${id}/complete`).set(p)).status).toBe(403);
    expect((await request(app).post(`/api/rides/${id}/complete`).set(d)).status).toBe(200);
    expect((await request(app).post(`/api/rides/${id}/complete`).set(d)).status).toBe(409);
  });
});

describe("bookings", () => {
  async function setup(seats = 2) {
    const d = await signup("d");
    const p = await signup("p");
    const id = await makeRide(d, { seats_total: seats });
    const bid = (await request(app).post(`/api/rides/${id}/bookings`).set(p).send({})).body.data.id;
    return { d, p, id, bid };
  }
  it("mine", async () => {
    const { p } = await setup();
    const res = await request(app).get("/api/bookings/mine").set(p);
    expect(res.body.data[0].driver_name).toBe("d");
  });
  it("setujui/tolak", async () => {
    const { d, p, bid, id } = await setup();
    expect((await request(app).patch("/api/bookings/9999").set(d).send({ status: "approved" })).status).toBe(404);
    expect((await request(app).patch(`/api/bookings/${bid}`).set(p).send({ status: "approved" })).status).toBe(403);
    expect((await request(app).patch(`/api/bookings/${bid}`).set(d).send({ status: "x" })).status).toBe(400);
    expect((await request(app).patch(`/api/bookings/${bid}`).set(d).send({ status: "approved" })).body.message).toBe("Pemesanan disetujui");
    expect((await request(app).patch(`/api/bookings/${bid}`).set(d).send({ status: "approved" })).status).toBe(409);
    const q = await signup("q");
    const b2 = (await request(app).post(`/api/rides/${id}/bookings`).set(q).send({})).body.data.id;
    expect((await request(app).patch(`/api/bookings/${b2}`).set(d).send({ status: "rejected" })).body.message).toBe("Pemesanan ditolak");
  });
  it("kapasitas saat approve & ride tidak aktif", async () => {
    const { d, id, bid } = await setup(1);
    const q = await signup("q");
    const b2 = (await request(app).post(`/api/rides/${id}/bookings`).set(q).send({})).body.data.id;
    await request(app).patch(`/api/bookings/${bid}`).set(d).send({ status: "approved" });
    expect((await request(app).patch(`/api/bookings/${b2}`).set(d).send({ status: "approved" })).status).toBe(409);
    await request(app).post(`/api/rides/${id}/complete`).set(d);
    // b2 otomatis rejected saat selesai -> sudah diproses
    expect((await request(app).patch(`/api/bookings/${b2}`).set(d).send({ status: "approved" })).status).toBe(409);
  });
  it("ride tidak aktif untuk booking pending (data langsung)", async () => {
    const db = openDb(":memory:");
    const a = createApp(db, { jwtSecret: SECRET });
    const reg = async (u) => {
      await request(a).post("/api/auth/register").send({ name: u, username: u, password: "secret1" });
      return { Authorization: `Bearer ${(await request(a).post("/api/auth/login").send({ username: u, password: "secret1" })).body.data.token}` };
    };
    const d = await reg("d");
    const p = await reg("p");
    const rid = (await request(a).post("/api/rides").set(d).send({ origin: "A", destination: "B", departure_time: future(), seats_total: 2 })).body.data.id;
    const bid = (await request(a).post(`/api/rides/${rid}/bookings`).set(p).send({})).body.data.id;
    db.prepare("UPDATE rides SET status='cancelled' WHERE id=?").run(rid);
    expect((await request(a).patch(`/api/bookings/${bid}`).set(d).send({ status: "approved" })).status).toBe(409);
  });
  it("batal", async () => {
    const { d, p, bid, id } = await setup();
    expect((await request(app).post("/api/bookings/9999/cancel").set(p)).status).toBe(404);
    expect((await request(app).post(`/api/bookings/${bid}/cancel`).set(d)).status).toBe(403);
    expect((await request(app).post(`/api/bookings/${bid}/cancel`).set(p)).status).toBe(200);
    expect((await request(app).post(`/api/bookings/${bid}/cancel`).set(p)).status).toBe(409);
    expect(id).toBeTruthy();
  });
  it("rating", async () => {
    const { d, p, bid, id } = await setup();
    expect((await request(app).post("/api/bookings/9999/rating").set(p).send({ rating: 5 })).status).toBe(404);
    expect((await request(app).post(`/api/bookings/${bid}/rating`).set(d).send({ rating: 5 })).status).toBe(403);
    expect((await request(app).post(`/api/bookings/${bid}/rating`).set(p).send({ rating: 5 })).status).toBe(409);
    await request(app).patch(`/api/bookings/${bid}`).set(d).send({ status: "approved" });
    await request(app).post(`/api/rides/${id}/complete`).set(d);
    expect((await request(app).post(`/api/bookings/${bid}/rating`).set(p).send({ rating: 9 })).status).toBe(400);
    expect((await request(app).post(`/api/bookings/${bid}/rating`).set(p).send({ rating: 5 })).status).toBe(200);
    expect((await request(app).post(`/api/bookings/${bid}/rating`).set(p).send({ rating: 5 })).status).toBe(409);
  });
});

describe("login via Delcom (cadangan)", () => {
  it("akun Delcom dibuat lokal lalu bisa login lagi; password berubah diperbarui", async () => {
    const dc = vi.fn().mockResolvedValue({ name: "Robot" });
    const a = createApp(openDb(":memory:"), { jwtSecret: SECRET, delcomLogin: dc });
    const r1 = await request(a).post("/api/auth/login").send({ username: "Robot@Mail.com", password: "pw1" });
    expect(r1.status).toBe(200);
    expect(dc).toHaveBeenCalledWith("robot@mail.com", "pw1");
    dc.mockResolvedValue({ name: "" });
    const r2 = await request(a).post("/api/auth/login").send({ username: "robot@mail.com", password: "pw2" });
    expect(r2.status).toBe(200);
    expect(dc).toHaveBeenCalledTimes(2);
    expect((await request(a).post("/api/auth/login").send({ username: "robot@mail.com", password: "pw2" })).status).toBe(200);
    expect(dc).toHaveBeenCalledTimes(2);
  });
  it("nama default = username bila Delcom tak memberi nama", async () => {
    const a = createApp(openDb(":memory:"), { jwtSecret: SECRET, delcomLogin: async () => ({}) });
    const t = (await request(a).post("/api/auth/login").send({ username: "x@y.z", password: "pw1" })).body.data.token;
    const me = await request(a).get("/api/users/me").set({ Authorization: `Bearer ${t}` });
    expect(me.body.data.name).toBe("x@y.z");
  });
  it("ditolak Delcom -> 401", async () => {
    const a = createApp(openDb(":memory:"), { jwtSecret: SECRET, delcomLogin: async () => null });
    expect((await request(a).post("/api/auth/login").send({ username: "a@b.c", password: "pw1" })).status).toBe(401);
  });
  it("delcomLoginDefault: sukses, ditolak, jaringan error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { user: { name: "N" } } }) }));
    expect(await delcomLoginDefault("a", "b")).toEqual({ name: "N" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
    expect(await delcomLoginDefault("a", "b")).toBeNull();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    expect(await delcomLoginDefault("a", "b")).toBeNull();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("net")));
    expect(await delcomLoginDefault("a", "b")).toBeNull();
    process.env.DELCOM_BASEURL = "http://x";
    const f = vi.fn().mockResolvedValue({ ok: false });
    vi.stubGlobal("fetch", f);
    await delcomLoginDefault("a", "b");
    expect(f.mock.calls[0][0]).toBe("http://x/auth/login");
    delete process.env.DELCOM_BASEURL;
    vi.unstubAllGlobals();
  });
});
