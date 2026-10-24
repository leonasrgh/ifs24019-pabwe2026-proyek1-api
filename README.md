# NebengKampus API (ifs24019-pabwe2026-proyek1-api)

Express.js + SQLite bawaan Node (`node:sqlite`, tanpa kompilasi native; butuh Node >= 22.13). Autentikasi JWT.

```bash
cp .env.example .env     # lalu isi JWT_SECRET
npm install
JWT_SECRET=rahasia npm start   # http://localhost:8000
npm run test:coverage
```

Format respons: `{ success, message, data }`. Semua endpoint selain `/api/auth/*` dan `/api/health` butuh `Authorization: Bearer <token>`.

| Method | Path | Keterangan |
|---|---|---|
| POST | /api/auth/register | name, username, password, phone? |
| POST | /api/auth/login | username, password -> token |
| GET | /api/users/me | profil + rating sebagai pengemudi |
| GET | /api/rides | cari (query: origin, destination, date=YYYY-MM-DD) |
| POST | /api/rides | origin, destination, departure_time, seats_total, price?, notes? |
| GET | /api/rides/mine | tumpangan yang saya tawarkan |
| GET | /api/rides/:id | detail |
| POST | /api/rides/:id/bookings | seats? (penumpang memesan) |
| GET | /api/rides/:id/bookings | daftar pemesan (pengemudi) |
| POST | /api/rides/:id/complete | selesaikan perjalanan (pengemudi) |
| GET | /api/bookings/mine | pemesanan saya |
| PATCH | /api/bookings/:id | status: approved / rejected (pengemudi) |
| POST | /api/bookings/:id/cancel | batalkan (penumpang) |
| POST | /api/bookings/:id/rating | rating 1-5, review? (setelah selesai) |

Catatan: SQLite menyimpan data di file (`DB_PATH`). Di hosting dengan disk sementara, data hilang saat redeploy — pasang volume/persistent disk.
