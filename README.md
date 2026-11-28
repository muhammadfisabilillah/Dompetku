# DompetKu

E-Wallet Kantin Kampus — Tubes 1 Komputasi Awan (studi kasus K03).

## Anggota Kelompok
- Muhammad Fisabilillah (GitHub: `muhammadfisabilillah`) — Tech Lead / Backend
- Kemas Ibnu (GitHub: `kemasibnu53`) — DevOps Engineer
- huaweicoid12 (GitHub: `huaweicoid12`) — Container Engineer + QA & Tech Writer

> Nomor kelompok: `[isi sesuai hasil undian]`
> Nama di atas disusun dari riwayat commit GitHub; sesuaikan dengan data resmi kelompok di laporan.

## Stack
- Node.js 22, Express
- PostgreSQL 16 (library `pg`, SQL mentah, tanpa ORM)
- Jest + Supertest
- Docker, Compose, Jenkins

## Fitur
- Registrasi akun (POST /accounts) → return API key
- Cek saldo (GET /accounts/:id/balance)
- Top-up (POST /accounts/:id/topup) dengan Idempotency-Key
- Transfer (POST /transfers) dengan Idempotency-Key
- Riwayat transaksi / ledger (GET /accounts/:id/transactions)
- Antarmuka web sederhana (EJS) di `/`, `/register`, `/balance`, `/topup`, `/transfer`, `/transactions`
- Health check (GET /health)

## Aturan Bisnis
1. Saldo tidak boleh negatif (CHECK di DB + validasi di service).
2. Transfer atomik: debit + kredit + dua baris ledger dalam satu transaksi DB, dengan `SELECT ... FOR UPDATE` urut id untuk mencegah deadlock/overselling.
3. Nominal minimal Rp 1.000 (top-up maupun transfer).
4. Total transfer keluar per akun per hari (WIB) maksimal Rp 2.000.000.
5. Idempotency-Key yang sama tidak diproses dua kali (top-up & transfer).
6. Transfer ke akun sendiri ditolak; akun tidak ditemukan → 404.

## Cara Run Lokal
```bash
cp .env.example .env      # lalu isi DB_PASSWORD & DOCKERHUB_USER
npm install
npm run migrate
npm run seed
npm start
```

## Cara Test
```bash
# Butuh PostgreSQL. Paling mudah lewat container test:
docker compose -p dompetku-test -f compose.test.yaml up --build --abort-on-container-exit --exit-code-from test
docker compose -p dompetku-test -f compose.test.yaml down -v
```

## Pipeline Jenkins
Job: **Pipeline → Pipeline script from SCM** (Jenkinsfile di root repo), dipicu GitHub webhook
`https://<ngrok-domain>/github-webhook/`.

| Stage | Isi |
|---|---|
| Checkout | `checkout scm` |
| Prepare Env | salin secret file `dompetku-env` Jenkins ke `.env` |
| Test | `compose.test.yaml` + `--exit-code-from test` (quality gate) |
| Build Image | tag `$BUILD_NUMBER` dan `latest` |
| Push Image | login via credential `dockerhub-credentials`, push kedua tag |
| Backup DB | `pg_dump` dari container db → `archiveArtifacts` (khusus K03) |
| Migrate | `docker compose run --rm app npm run migrate` (khusus K03) |
| Deploy | `docker compose pull app && up -d` (image dari Docker Hub) |
| Smoke Test | retry `curl -fsS http://localhost:8000/health`, gagal jika bukan 200 |

Credential yang dibutuhkan di Jenkins:
- `dockerhub-credentials` — Username/Password (Docker Hub PAT)
- `dompetku-env` — Secret file (isi `.env` produksi, termasuk `DOCKERHUB_USER`)

Blok `post` mencetak ringkasan sukses/gagal dan membersihkan container test serta `.env`.

## Kontrak Tim
- Listen: `0.0.0.0:8000` (env `PORT`)
- `GET /health` → 200 `{"status":"ok","database":"up"}`; DB mati → 503 `{"status":"error","database":"down"}`
- `npm run migrate` terpisah (TIDAK otomatis saat app start)
- `compose.test.yaml` untuk testing di CI
- Branch `main` hanya diubah lewat pull request (lihat CONTRIBUTING.md)

## Bukti Pengumpulan
- Repository GitHub: `[isi link repo]`
- Jenkins (Ngrok): `[isi link ngrok]`
- Akun dosen Jenkins: `[isi username/password]`
- PDF laporan: `Kelompok<No>_DompetKu_TugasDevOps.pdf`
