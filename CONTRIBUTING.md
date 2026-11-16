# Kontribusi — DompetKu

## Sumber kebenaran
README.md (fitur, aturan bisnis, kontrak tim) + file ini (alur kerja & konvensi).
Config agent pribadi (AGENTS.md, opencode.json, .opencode/, .kilocode/) bersifat LOKAL
dan di-gitignore; arahkan agent masing-masing ke dua file di atas. Jangan duplikasi isinya.

## Alur kerja (wajib)
1. Tidak ada push langsung ke main; semua lewat branch feat|fix|chore/<nama>.
2. Satu PR = satu fitur/perbaikan kecil; judul feat:/fix:/chore: + ringkasan.
3. PR wajib: npm test hijau lokal, deskripsi + bukti test, review minimal 1 anggota,
   merge oleh Tech Lead/owner peran.
4. Setelah merge, pipeline yang men-deploy; tidak ada deploy manual.

## Konvensi kode
- Uang integer rupiah (BIGINT), dilarang float; hasil pg (string) dikonversi Number().
- Setiap mutasi saldo menulis ledger balance_before & balance_after.
- Transfer: satu transaksi DB + SELECT ... FOR UPDATE urut id asc.
- Error: bisnis 422, tidak ditemukan 404, auth 401/403, unik 409; jangan 500 untuk input.
- Batas harian pakai WIB (UTC+7). Migrasi baru = file SQL baru (jangan edit yang applied).
- Secret hanya via env; .env & .env.test tidak pernah di-commit.

## Definition of Done
- [ ] Fitur sesuai README; aturan bisnis tervalidasi di server
- [ ] Test bertambah (aturan bisnis wajib test); npm test hijau
- [ ] Diff bebas secret; env baru masuk .env.example
- [ ] Checklist review di bawah lolos; PR di-merge & pipeline hijau

## Checklist review PR (dipakai semua reviewer)
1. Aturan bisnis (saldo≥0, atomik+lock, min 1000, limit 2jt/hari, idempotency) di server
2. Ledger before/after tertulis untuk setiap mutasi
3. Error code sesuai konvensi; test mencakup kasus gagal, bukan hanya happy path
4. Tidak ada secret/hardcode; kontrak tim utuh (/health, port 8000, npm start tanpa migrate)