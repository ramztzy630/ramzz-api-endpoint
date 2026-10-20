# Canvas API Vercel Serverless

API pembuat gambar / meme WhatsApp Bot (IQC, TTQC, Windows Media Player) yang berjalan 100% gratis di Vercel Serverless.

## Cara Deploy ke Vercel via GitHub:
1. Buat Repository baru di GitHub (Bisa Private).
2. Upload semua file dalam folder ini ke repository GitHub tersebut.
3. Buka [vercel.com](https://vercel.com), login dengan akun GitHub.
4. Klik **Add New** > **Project** > Pilih repository ini.
5. Klik **Deploy**.
6. Salin domain yang diberikan oleh Vercel (contoh: `https://canvas-api-xxx.vercel.app`).
7. Buka file `lib/imageApi.js` di bot WhatsApp kamu, ganti nilai `REMOTE_BASE` dengan domain Vercel tersebut.
