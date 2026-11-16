# Setup DompetKu

1. Pastikan PostgreSQL 16 berjalan (Docker atau lokal).
2. Salin `.env.example` ke `.env` dan `.env.test.example` ke `.env.test`.
3. Isi password DB dari kredensial lokal Anda (lihat `.env.example` untuk format).
4. Jalankan `npm install`.
5. Jalankan `npm run migrate`.
6. Jalankan `npm run seed`.
7. Jalankan `npm test`.