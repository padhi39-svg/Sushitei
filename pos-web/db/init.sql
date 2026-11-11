-- BASE: Master User + Master Level Manager saja (tanpa tabel transaksi)
-- Jalankan: psql -U postgres -h localhost -f db/init.sql
-- Semua id urut 1,2,3... pakai GENERATED ALWAYS AS IDENTITY

CREATE DATABASE pos_transaksi;
\c pos_transaksi

CREATE TABLE IF NOT EXISTS master_level_manager (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code VARCHAR(100) NOT NULL UNIQUE,
  name VARCHAR(200) NOT NULL,
  isdelete INTEGER NOT NULL DEFAULT 0,
  user_create INTEGER,
  user_edit INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS master_permissions (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code VARCHAR(100) NOT NULL UNIQUE,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  isdelete INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS menu_permissions (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  menu_code VARCHAR(100) NOT NULL,
  permission_code VARCHAR(100) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX uq_menu_permissions ON menu_permissions(menu_code, permission_code);

CREATE TABLE IF NOT EXISTS level_permissions (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  level_id INTEGER NOT NULL REFERENCES master_level_manager(id),
  menu_code VARCHAR(100) NOT NULL,
  permission_code VARCHAR(100) NOT NULL,
  allowed INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX uq_level_permissions ON level_permissions(level_id, menu_code, permission_code);

CREATE TABLE IF NOT EXISTS master_users (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code VARCHAR(100) UNIQUE,
  name VARCHAR(200),
  level_id INTEGER REFERENCES master_level_manager(id),
  aktif INTEGER NOT NULL DEFAULT 1,
  is_active INTEGER NOT NULL DEFAULT 1,
  isdelete INTEGER NOT NULL DEFAULT 0,
  email VARCHAR(200) UNIQUE,
  password_hash TEXT,
  user_create INTEGER,
  user_edit INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_master_users_email ON master_users(email);

CREATE TABLE IF NOT EXISTS user_barang_jenis (
  user_id INTEGER NOT NULL REFERENCES master_users(id) ON DELETE CASCADE,
  jenis INTEGER NOT NULL,
  PRIMARY KEY (user_id, jenis)
);

CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES master_users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_sessions_token ON sessions(token);

CREATE TABLE IF NOT EXISTS settings (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  setting_key VARCHAR(200) NOT NULL UNIQUE,
  setting_value TEXT,
  setting_group VARCHAR(100),
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed permissions default (sama seperti D:\pos)
INSERT INTO master_permissions(code, name, description, sort_order) VALUES
  ('VIEW','View','Melihat data',1),
  ('CREATE','Create','Membuat data baru',2),
  ('EDIT','Edit','Mengubah data',3),
  ('DELETE','Delete','Menghapus data (termasuk Void)',4),
  ('EXPORT','Export','Export data ke Excel/PDF',5),
  ('IMPORT','Import','Import data dari file',6),
  ('APPROVE','Approve','Menyetujui/approve dokumen',7),
  ('PRINT','Print','Mencetak dokumen',8),
  ('QTY_MINUS','Qty Minus','Mengizinkan input quantity minus',9),
  ('EDIT_PRICE','Edit Harga','Mengizinkan edit harga POS',12),
  ('BACKDATE','Backdate','Mengizinkan tanggal mundur',13)
ON CONFLICT (code) DO NOTHING;

-- Seed level awal
INSERT INTO master_level_manager(code, name) VALUES
  ('SUPERADMIN','Super Admin'),
  ('KASIR','Kasir'),
  ('GUDANG','Gudang'),
  ('ACCOUNTING','Accounting')
ON CONFLICT (code) DO NOTHING;

-- MASTER INGREDIENT (RESEP / BOM) - header + detail
-- Barang disimpan sebagai KODE dari SQL Server Omega (tanpa sync).
\i ingredient.sql
