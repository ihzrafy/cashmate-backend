# 💰 CashMate - Smart Personal Finance Tracker (Multi-Tenant SaaS)

Aplikasi Asisten Manajemen Keuangan Pribadi modern, elegan, dan siap produksi berbasis **React.js (Vite)** di sisi Frontend dan **Express.js** di sisi Backend dengan integrasi **Telegram Bot** dan **Google Sheets API** sebagai database utama (didukung *Multi-Tenant Google Sheets & Local JSON Fallback*).

---

## 🌟 Fitur Utama

### 1. Dashboard Interaktif & FinTech UI
- **5 Kartu Metrik Utama**:
  - **Saldo Bersih Real-Time**: Akumulasi total saldo saat ini.
  - **Pemasukan Bulan Ini**: Dilengkapi indikator perbandingan vs bulan sebelumnya.
  - **Pengeluaran Bulan Ini**: Dilengkapi indikator perbandingan vs bulan sebelumnya.
  - **Rasio Tabungan (Savings Rate %)**: Persentase pendapatan yang berhasil ditabung dengan progress meter.
  - **Rata-Rata Pengeluaran Harian**: Laju pengeluaran rata-rata per hari.
- **Visualisasi Recharts Lengkap**:
  - **Tren 6 Bulan Terakhir**: Grafik area kurva halus untuk pemasukan vs pengeluaran.
  - **Alokasi Kategori**: Donut chart dengan persentase dan label warna interaktif.
  - **Perbandingan Arus Kas**: Bar chart side-by-side pemasukan vs pengeluaran.
  - **Pengeluaran Harian**: Bar chart intensitas pengeluaran dari tanggal 1 hingga hari ini.
- **Dark Mode / Light Mode**: Tampilan modern dengan glassmorphism dan palet warna HSL.

### 2. Manajemen Transaksi Komprehensif (Full CRUD)
- **Pencarian Cepat & Filter Multi-Kriteria**: Cari berdasarkan kata kunci, filter jenis (Semua / Pemasukan / Pengeluaran), dan filter kategori.
- **Pencatatan Instan & Modal Edit**: Tambah dan perbarui transaksi dengan pemilih kategori cepat, format Rupiah otomatis, dan pemilih tanggal.
- **Penghapusan Aman**: Konfirmasi modal sebelum menghapus transaksi.
- **Ekspor CSV**: Unduh seluruh riwayat transaksi ke format `.csv` yang kompatibel dengan Microsoft Excel dan Google Sheets.
- **Paginasi Cerdas**: Navigasi halaman yang rapi dan responsif.

### 3. Pelacak Anggaran Bulanan (Budgeting Tracker)
- Atur batas pengeluaran (limit) bulanan per kategori (misal: Makan & Minum: Rp 3.000.000).
- Progress bar dengan indikator warna dinamis:
  - 🟢 **Aman**: < 80% dari batas anggaran
  - 🟡 **Waspada**: 80% - 100% dari batas anggaran
  - 🔴 **Over**: > 100% (melebihi anggaran)
- Tambah, edit nominal, dan hapus batas anggaran langsung dari antarmuka web.

### 4. Dual Storage Engine (Google Sheets + Local JSON Fallback)
- **Koneksi Google Sheets Otomatis**: Memverifikasi dan menginisialisasi header baris spreadsheet (`ID`, `Tanggal`, `Jenis`, `Jumlah`, `Kategori`, `Keterangan`, `Created_At`).
- **Resilien & Siap Pakai**: Jika kredensial Google Sheets belum diatur, aplikasi **tidak crash**, melainkan otomatis berjalan mulus menggunakan *Local Storage Engine* (`backend/data/transactions.json`) yang sudah terisi data simulasi realistis.

### 5. Multi-Tenant SaaS Architecture (Siap Dijual / Komersial)
- **1 Bot Telegram Melayani Banyak Orang**:
  - Setiap pengguna yang menekan `/start` otomatis terdaftar dengan profil dan data yang terisolasi 100%.
  - Transaksi Pengguna A tidak akan pernah bercampur atau terlihat oleh Pengguna B.
- **Google Sheets Pribadi per Pengguna (`/connect`)**:
  - Setiap pembeli/klien dapat menghubungkan Google Spreadsheet mereka sendiri ke bot dengan perintah `/connect <link_spreadsheet>` atau langsung dari dashboard web.
  - Jika belum menghubungkan Google Sheets, sistem secara cerdas menyimpan catatan di cloud tenant lokal, lalu otomatis mensinkronisasikannya begitu spreadsheet dihubungkan.
- **Akses Dashboard Web Tanpa Password (`/web` Magic Link)**:
  - Pengguna cukup mengetik `/web` atau `/dashboard` di bot Telegram untuk mendapatkan tautan login sekali klik dengan token aman (`?auth=usr_...`).
  - Web dashboard menampilkan avatar, nama profil, status spreadsheet pribadi, dan opsi putus/sambung spreadsheet.
  - `/laporan` : Ringkasan keuangan bulanan dan 5 pengeluaran terbesar.
  - `/transaksi` : Daftar 5 transaksi terakhir.
  - `/budget` : Status batas anggaran kategori dan peringatan over-budget.
  - `/help` : Panduan lengkap format chat.
- **Simulator Chat di Web**: Uji coba parsing dan logika bot langsung dari modal browser tanpa perlu membuka aplikasi Telegram!

---

## 🚀 Panduan Menjalankan Aplikasi

### Persyaratan Sistem
- Node.js (versi 18 ke atas)
- npm

### 1. Menjalankan Backend
Masuk ke folder `backend`:
```bash
cd backend
npm install
npm run dev
```
Backend akan berjalan di `http://localhost:4000`.

### 2. Menjalankan Frontend
Buka terminal baru, masuk ke folder `frontend`:
```bash
cd frontend
npm install
npm run dev
```
Frontend akan berjalan di `http://localhost:5173`. Buka alamat tersebut di browser Anda!

---

## ⚙️ Konfigurasi Environment (`.env`)

Buat file `.env` di dalam folder `backend`:
```env
PORT=4000
TELEGRAM_BOT_TOKEN=your-telegram-bot-token
SPREADSHEET_ID=your-google-spreadsheet-id
SHEET_NAME=Transactions
GOOGLE_SERVICE_ACCOUNT_PATH=./service-account.json
```

*(Catatan: Jika variabel di atas tidak diisi, aplikasi akan otomatis berjalan dalam mode Local JSON Storage dengan simulasi bot aktif di web).*

---

## 🤖 Cara Setup Telegram Bot

1. Buka aplikasi Telegram dan cari **@BotFather**.
2. Ketik perintah `/newbot` dan ikuti instruksi penamaan bot Anda.
3. Salin **HTTP API Token** yang diberikan oleh BotFather.
4. Masukkan token tersebut ke `TELEGRAM_BOT_TOKEN` pada file `backend/.env`.
5. Restart backend (`npm run dev`), lalu buka bot Anda di Telegram dan ketik `/start`.

---

## 📊 Cara Setup Google Sheets API

1. Buka [Google Cloud Console](https://console.cloud.google.com/).
2. Buat Project baru, lalu aktifkan **Google Sheets API** pada menu *APIs & Services*.
3. Buat **Service Account** di menu *IAM & Admin > Service Accounts*.
4. Klik tab **Keys > Add Key > Create new key > JSON**. Unduh file kunci JSON tersebut dan simpan di folder `backend/service-account.json`.
5. Buka Google Spreadsheet baru di browser, lalu klik tombol **Share / Bagikan**. Masukkan alamat email Service Account (berakhiran `@...iam.gserviceaccount.com`) dengan peran **Editor**.
6. Salin ID spreadsheet dari URL browser (bagian di antara `/d/` dan `/edit`):
   ```
   https://docs.google.com/spreadsheets/d/[SPREADSHEET_ID_ANDA]/edit
   ```
7. Masukkan ID tersebut ke `SPREADSHEET_ID` pada file `backend/.env` dan restart backend.

---

## 🛠️ REST API Endpoints

| Metode | Endpoint | Deskripsi |
| :--- | :--- | :--- |
| `GET` | `/health` | Status kesehatan sistem, mode penyimpanan, dan bot |
| `GET` | `/api/status` | Diagnostik koneksi Google Sheets & Telegram |
| `GET` | `/api/summary` | Metrik saldo, rasio tabungan, grafik, dan kategori |
| `GET` | `/api/transactions` | Daftar transaksi dengan filter `type`, `category`, `search`, `page`, `limit` |
| `POST` | `/api/transactions` | Menambah transaksi baru |
| `PUT` | `/api/transactions/:id` | Mengubah transaksi tersimpan |
| `DELETE` | `/api/transactions/:id` | Menghapus transaksi |
| `GET` | `/api/budgets` | Mendapatkan batas anggaran per kategori |
| `POST` | `/api/budgets` | Menyimpan perubahan batas anggaran |
| `GET` | `/api/export` | Mengunduh file `transaksi-keuangan.csv` |
| `POST` | `/api/telegram/simulate` | Endpoint simulasi pesan chat Telegram untuk pengujian web |
