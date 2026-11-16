# DompetKu

E-Wallet Kantin Kampus — Tubes 1 Komputasi Awan.

## Anggota Kelompok
- Muhammad Fisabilillah (Tech Lead / Backend)
- [Nama B] (DevOps Engineer)
- [Nama C] (Container Engineer + Tech Writer)
- Nomor kelompok: [placeholder]

## Stack
- Node.js 22, Express
- PostgreSQL 16 (library `pg`, SQL mentah, tanpa ORM)
- Jest + Supertest
- Docker, Jenkins

## Fitur
- Registrasi akun (POST /accounts) → return API key
- Cek saldo (GET /accounts/:id/balance)
- Top-up (POST /accounts/:id/topup) dengan Idempotency-Key
- Transfer (POST /transfers) dengan Idempotency-Key
- Riwayat transaksi / ledger (GET /accounts/:id/transactions)

## Aturan Bisnis
1. Saldo tidak boleh negatif.
2. Transfer atomik (debit + kredit + ledger dalam satu transaksi DB, SELECT ... FOR UPDATE ORDER BY id).
3. Nominal minimal Rp 1.000.
4. Total transfer keluar per akun per hari (WIB) maksimal Rp 2.000.000.
5. Idempotency-Key sama tidak diproses dua kali.
6. Transfer ke akun sendiri ditolak; akun tidak ditemukan → 404.

## Cara Run Lokal
```bash
cp .env.example .env
npm install
npm run migrate
npm run seed
npm start
```

## Kontrak Tim
- Listen: `0.0.0.0:8000` (env `PORT`)
- `GET /health` → 200 `{"status":"ok","database":"up"}`; DB mati → 503 `{"status":"error","database":"down"}`
- `npm run migrate` terpisah (TIDAK otomatis saat app start)
- `compose.test.yaml` untuk testing di CI