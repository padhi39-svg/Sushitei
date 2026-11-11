# POS Web - Omega Base (Master Barang, Satuan, Harga Jual + User/Level)

- **Postgres `pos_transaksi`** = Master User + Master Level Manager saja (ID urut 1,2,3...). Form transaksi belum dibuat.
- **SQL Server Omega** = master Barang, Satuan, Harga Jual dibaca **langsung** (read-only, tanpa sync).
- **Web (Next.js 14)** = FE+BE satu, port **3012**.

## Menu (mengikuti nama D:\pos)
- Dashboard
- **Barang**: Master Barang (`/barang`), Master Satuan (`/barang/satuan`), Master Harga Jual (`/barang/harga`)
- **Setting**: Master User (`/users`), Master Level Manager (`/level-manager`)

Menu lain (Pembelian, Penjualan, Reservasi, Stok, Keuangan, Laporan) belum ditampilkan.

## Sumber data master (SQL Server Omega)
- `dbo.Barang` -> Master Barang
- `dbo.Satuan` -> Master Satuan (`Satuan.Brg = Barang.Kode`)
- `dbo.BrgPrice` -> Master Harga Jual (`Brg + Rasio` -> `Satuan`)

Koneksi default di `.env`:
```
MSSQL_HOST=localhost
MSSQL_INSTANCE=SQLEXPRESS
MSSQL_DATABASE=Omega
MSSQL_USER=sa
MSSQL_PASSWORD=omega
```
Mixed Mode SQL Server sudah diaktifkan (Windows + SQL Login).

## Login web (mirip D:\pos)
- Halaman: `/login` (Email + Password)
- API: `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`
- Session: cookie `session_token` httpOnly + `x-user-id`, tabel `sessions`, TTL 24 jam
- Middleware: semua halaman kecuali `/login` & `/api/auth/*` wajib login
- Admin pertama otomatis dibuat kalau belum ada user: `admin@yopmail.com` / `123456` (level ADMIN)

## Master User
Tabel `master_users`: id, code USR/000001 auto, name, level_id, email, password_hash, aktif, soft delete.
FE `/users`, BE `/api/users`.

## Master Level Manager
Tabel: `master_level_manager`, `master_permissions`, `menu_permissions`, `level_permissions`.
FE `/level-manager`, BE `/api/level-manager`.

## Setup
1. `psql -U postgres -h localhost -f db/init.sql`
2. Copy `.env.example` ke `.env`, isi DATABASE_URL + MSSQL_*
3. `npm install; npm run dev` -> http://localhost:3012/login

## Shortcut
- `JALANKAN-POS-3012.bat` (di Desktop: **POS Omega 3012 - NYALAKAN**)
- `AKTIFKAN-SQL-LOGIN.bat` (aktifkan Mixed Mode SQL Server, butuh Administrator)
