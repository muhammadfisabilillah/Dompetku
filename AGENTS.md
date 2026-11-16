# AGENTS.md: DompetKu (E-Wallet Kantin Kampus)

## Konteks
Proyek Tubes 1 Komputasi Awan (CI/CD Jenkins). Aplikasi ini hanya bahan latihan
pipeline, jadi harus kecil, benar, dan teruji. Peran kamu (agent) adalah
membantu Tech Lead/Backend. Peran lain (DevOps, Container) dikerjakan orang lain.

## Aturan kerja untuk agent
1. Kerjakan satu langkah per sesi, lalu berhenti dan tunggu konfirmasi.
2. JANGAN menyentuh Dockerfile, compose.yaml, Jenkinsfile (milik peran lain).
3. JANGAN hardcode kredensial. Semua konfigurasi dari environment variable.
4. JANGAN membuat atau meng-commit file .env. Hanya .env.example.
5. Semua validasi aturan bisnis ada di server (service layer), bukan di klien.
6. Setiap fitur dikirim bersama test-nya.
7. Setelah selesai, jelaskan apa yang dibuat per file dan mengapa, lalu berhenti.
8. Jangan menambah fitur atau dependency di luar langkah yang diminta.

## Stack (tidak boleh diganti)
Node 22, Express, PostgreSQL 16 (library `pg`, SQL mentah, tanpa ORM), Jest + Supertest.

Struktur:
- src/app.js (express app, tanpa listen)
- src/server.js (listen saja)
- src/db.js, src/migrate.js, src/seed.js
- src/routes/, src/services/
- migrations/, seeds/, tests/

## Konfigurasi
Env: PORT (default 8000), DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME, NODE_ENV.
Script npm: start, test, migrate, seed.
Migrasi TIDAK dijalankan otomatis saat app start; hanya lewat `npm run migrate`.

## Skema database
- accounts: id (serial pk), name, email (unique), api_key (unique), balance BIGINT NOT NULL
  DEFAULT 0 CHECK (balance >= 0), created_at.
- transactions: id, type (TOPUP | TRANSFER), from_account_id (nullable), to_account_id (nullable),
  amount BIGINT CHECK (amount >= 1000), idempotency_key (unique, nullable), created_at.
- ledger: id, account_id (FK), transaction_id (FK), amount BIGINT, balance_before BIGINT,
  balance_after BIGINT, created_at.

## Endpoint
- GET /health -> 200 {status:"ok", database:"up"}; jika DB gagal -> 503 {status:"error", database:"down"}.
- POST /accounts {name, email} -> 201 (return api_key).
- GET /accounts/:id/balance -> 200 {balance}; 403 jika X-API-Key bukan milik id.
- POST /accounts/:id/topup {amount}, header Idempotency-Key wajib -> 200/201.
- POST /transfers {from_account_id, to_account_id, amount}, header Idempotency-Key wajib -> 201.
- GET /accounts/:id/transactions -> ledger terurut terbaru, memuat balance_before dan balance_after.

## Aturan bisnis (wajib dites)
R1. Saldo tidak pernah negatif. Transfer melebihi saldo ditolak (422), saldo tetap.
R2. Transfer atomik: debit, kredit, catatan transfer, dan 2 baris ledger dalam
    satu transaksi DB. Gagal di tengah -> rollback semua. Kunci baris akun
    dengan SELECT ... FOR UPDATE, urut berdasarkan id (hindari deadlock).
R3. Nominal minimal Rp1.000 (top-up dan transfer), integer positif.
    Tidak valid -> 400/422.
R4. Total transfer keluar per akun maksimal Rp2.000.000 per hari
    (hari menurut zona Asia/Jakarta). Melebihi -> 422.
R5. Idempotency-Key sama tidak diproses dua kali: kembalikan hasil asli, saldo
    tidak berubah lagi. Key sama dengan payload berbeda -> 409.
R6. Transfer ke akun sendiri ditolak. Akun tidak ditemukan -> 404.

## Auth
- Header X-API-Key (diberikan saat POST /accounts).
- Sender transfer = req.account, TIDAK PERNAH dari body.
- GET /accounts/:id/balance -> 403 jika key bukan milik id itu.
- Key hilang/salah -> 401.

## Konvensi
- pg mengembalikan BIGINT/SUM sebagai STRING -> konversi Number().
- Map error pg: 23505 (unique) -> replay idempotency / 409; 23514 (check) -> 422.
- Error bisnis -> 422 {error}; tidak ditemukan -> 404; key hilang/salah -> 401.

## Test
- DB test terpisah dompetku_test (.env.test); globalSetup menjalankan migrasi;
  afterEach TRUNCATE ... CASCADE. Target 9 test.

## Definition of Done per fitur
Test hijau lokal, tidak ada secret di repo, PR kecil dengan deskripsi jelas.