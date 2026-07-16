# SnapAI Web

Antarmuka web untuk [SnapAI](https://github.com/betomoedano/snapai) — generator artwork
ikon aplikasi 1024 × 1024 untuk React Native dan Expo.

**Bring your own key.** Situs ini tidak punya API key sendiri. Tiap pengunjung menempel
key fal.ai, Google AI Studio, atau OpenAI miliknya, dan biaya generate ditanggung akun
mereka sendiri. Tidak ada database, tidak ada login, tidak ada yang disimpan di server.

## Key harus cocok dengan model

Tiap model berjalan di provider tertentu, dan key hanya berlaku di providernya
sendiri. Menempel key fal ke model Google menghasilkan error dari
`generativelanguage.googleapis.com` yang membingungkan, jadi UI menangkapnya
duluan: `detectKeyProvider()` di `lib/models.ts` menebak provider dari bentuk
key (`sk-` → OpenAI, `AIza` → Google, `uuid:hex` → fal) dan memblokir tombol
generate sebelum request terkirim. Tiap kolom key juga punya link **akses api**
ke halaman tempat mengambil key provider tersebut.

## Soal DeepSeek

API resmi DeepSeek (`deepseek-v4-flash`, `deepseek-v4-pro`) **tidak bisa membuat
gambar** — model teks dan penalaran saja. Key DeepSeek tidak berguna di sini.

Yang bisa: **Janus-Pro**, model multimodal open-weights dari DeepSeek, dihosting
fal di `fal-ai/janus`. Dipakai dengan key fal, bukan key DeepSeek. Tapi Janus-Pro
model kecil — aturan panjang dari `icon-prompt.ts` sebagian besar akan diabaikan,
dan hasilnya jauh di bawah Nano Banana.

Prinsip yang sama berlaku untuk model difusi lain di fal (FLUX, SDXL): mesin
prompt SnapAI dirancang untuk model yang *membaca instruksi*. Menambahkannya
mudah — satu entri di `MODELS` dan satu cabang di `generateFal()` — tapi jangan
berharap larangan-larangannya dipatuhi.

## Tentang fal.ai

fal.ai mem-proxy model Gemini yang sama, jadi prompt builder-nya bekerja utuh. Dua
keuntungannya: tidak perlu mengaktifkan billing Google Cloud, dan endpoint-nya cukup
dipanggil dengan `fetch` biasa — tidak ada dependency tambahan. Harganya sedikit di atas
harga langsung Google karena fal mengambil margin.

Kalau kamu punya kredit fal yang menganggur, pilih model bertanda "lewat fal.ai".

## Akses tertutup (kode undangan)

Halaman dijaga kode undangan. Satu kode per orang, dengan nama menempel padanya:

```
INVITE_CODES="budi:a3f9x2k1,siti:b7k2m9p4,rian:c1x8n3q7"
```

Cabut akses satu orang dengan menghapus entrinya lalu redeploy — **sesi yang
sedang berjalan pun langsung mati.** Token menyimpan sidik jari kode yang dipakai
saat login, dan setiap request mencocokkannya ulang ke `INVITE_CODES` yang berlaku.
Memutar kode seseorang punya efek yang sama. Mengganti `AUTH_SECRET` me-logout
semua orang sekaligus.

Tanpa database: `INVITE_CODES` sendiri yang jadi sumber kebenarannya.

Buat kode dan secret:

```bash
# satu kode acak
node -e "console.log(require('crypto').randomBytes(6).toString('hex'))"

# AUTH_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

> **Ini tirai, bukan brankas.** Karena setiap orang tetap memakai API key sendiri,
> kode yang bocor tidak merugikanmu secara finansial — paling banter orang asing
> ikut memakai kuota function Vercel-mu. Gunanya membatasi siapa yang melihat
> alat ini, bukan melindungi dompet.

Gerbangnya diperiksa di dua tempat: `app/page.tsx` (redirect, sekadar kesopanan)
dan `app/api/generate/route.ts` — yang kedua ini yang sungguh menjaga, karena tanpa
itu endpoint bisa dipanggil langsung.

## Jalankan lokal

```bash
cp .env.example .env.local   # lalu isi INVITE_CODES dan AUTH_SECRET
npm install
npm run dev
```

Buka http://localhost:3000. Kalau `.env.local` belum diisi, halaman login akan
bilang persis apa yang kurang — sistemnya fail closed, tidak pernah terbuka
karena lupa konfigurasi.

## Deploy ke Vercel

1. Push repo ini ke GitHub, di **akun personal** kamu (Vercel Hobby tidak bisa connect ke
   repo milik GitHub organization).
2. Di Vercel: **Add New → Project**, import repo-nya.
3. Framework otomatis terdeteksi sebagai Next.js.
4. Di **Settings > Environment Variables**, isi dua nilai: `INVITE_CODES` dan
   `AUTH_SECRET`. API key provider **tidak** diisi di sini — itu tetap ditempel
   tiap pengunjung lewat UI.
5. Deploy.

Hobby plan cukup untuk ini, tapi ingat: Hobby hanya boleh untuk penggunaan pribadi dan
non-komersial. Begitu ada iklan atau monetisasi, harus pindah ke Pro.

## Biaya

Hosting Vercel gratis. Generate gambar tidak. Harga indikatif per gambar 1024 × 1024:

| Model | Lewat | Perkiraan harga |
| --- | --- | --- |
| Nano Banana 2 (`fal-ai/nano-banana-2`) | fal.ai | ~$0.08 (2K ×1.5, 4K ×2) |
| Nano Banana (`fal-ai/nano-banana`) | fal.ai | ~$0.039 |
| Nano Banana 2 (`gemini-3.1-flash-image-preview`) | Google | ~$0.067 |
| Nano Banana Pro (`gemini-3-pro-image-preview`) | Google | ~$0.134 (1K) – $0.24 (4K) |
| Nano Banana lawas (`gemini-2.5-flash-image`) | Google | ~$0.039 |
| OpenAI GPT Image 1 / 1.5 / 2 | OpenAI | ~$0.04 – $0.17 |

Harga bisa berubah. Cek halaman pricing provider sebelum bergantung pada angka di atas.

> **Peringatan deprecation.** Google menjadwalkan `gemini-2.5-flash-image` mati pada
> 2 Oktober 2026. Model itu masih tersedia di dropdown supaya sejalan dengan CLI-nya,
> tapi jangan dijadikan default.

## Soal keamanan key

Key pengunjung dikirim ke `/api/generate` lewat **body POST** (bukan query string, yang
akan bocor ke access log), dipakai untuk satu panggilan, lalu dilepas. Tidak ditulis ke
disk, tidak di-log. `redact()` di `lib/providers.ts` menyapu apa pun yang berbentuk key
dari pesan error sebelum dikirim balik ke browser, karena SDK provider kadang menempelkan
konteks request ke objek error.

Tetap saja: pengunjung harus mempercayai server kamu. Itu ditulis terang-terangan di UI.

## Struktur

```
app/
  page.tsx              halaman (dijaga; redirect ke /login kalau belum masuk)
  login/page.tsx        gerbang kode undangan
  api/login/route.ts    tukar kode jadi cookie sesi
  api/logout/route.ts   hapus cookie
  layout.tsx            font + metadata
  globals.css
  api/generate/route.ts satu gambar per request (lihat catatan 4.5 MB di dalamnya)
components/
  IconStudio.tsx        seluruh UI, client component
lib/
  auth.ts               kode undangan + cookie HMAC, tanpa dependency
  icon-prompt.ts        DISALIN dari SnapAI, tanpa perubahan
  styleTemplates.ts     DISALIN dari SnapAI, tanpa perubahan
  models.ts             katalog model — bebas SDK, dipakai server DAN browser
  providers.ts          pemanggil fal.ai / Gemini / OpenAI, stateless
```

`icon-prompt.ts` dan `styleTemplates.ts` adalah otak proyek ini dan disalin apa adanya
dari SnapAI. Keduanya fungsi murni tanpa dependensi Node, jadi dipakai di dua tempat:
di server untuk membangun prompt sungguhan, dan di browser untuk preview prompt live
(padanan `--prompt-only` di CLI) tanpa memanggil server sama sekali.

## Lisensi

MIT. Karya turunan dari SnapAI oleh Beto Moedano — lihat `LICENSE`.
