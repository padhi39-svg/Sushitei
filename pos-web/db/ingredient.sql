-- MASTER INGREDIENT (RESEP / BOM)
-- Header + detail. Barang disimpan sebagai KODE dari SQL Server Omega (tanpa sync).
-- Jalankan: psql -U postgres -h localhost -d pos_transaksi -f db/ingredient.sql

CREATE SEQUENCE IF NOT EXISTS master_ingredient_code_seq;

CREATE TABLE IF NOT EXISTS master_ingredient (
  id           INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code         VARCHAR(100) NOT NULL UNIQUE
               DEFAULT ('ING/' || lpad(nextval('master_ingredient_code_seq')::text, 6, '0')),
  barang_kode  VARCHAR(100) NOT NULL,              -- Omega.Barang.Kode (barang jadi)
  name         VARCHAR(200) NOT NULL,
  portion      NUMERIC(12,2) NOT NULL DEFAULT 1,
  description  TEXT,
  aktif        INTEGER NOT NULL DEFAULT 1,
  isdelete     INTEGER NOT NULL DEFAULT 0,
  user_create  INTEGER REFERENCES master_users(id),
  user_edit    INTEGER REFERENCES master_users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 1 barang jadi hanya boleh punya 1 resep aktif
CREATE UNIQUE INDEX IF NOT EXISTS uq_master_ingredient_barang
  ON master_ingredient(barang_kode) WHERE isdelete = 0;
CREATE INDEX IF NOT EXISTS idx_master_ingredient_barang ON master_ingredient(barang_kode);
CREATE INDEX IF NOT EXISTS idx_master_ingredient_aktif ON master_ingredient(aktif);
CREATE INDEX IF NOT EXISTS idx_master_ingredient_isdelete ON master_ingredient(isdelete);

CREATE TABLE IF NOT EXISTS master_ingredient_item (
  id             INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ingredient_id  INTEGER NOT NULL REFERENCES master_ingredient(id) ON DELETE CASCADE,
  bahan_kode     VARCHAR(100) NOT NULL,            -- Omega.Barang.Kode (bahan baku)
  qty            NUMERIC(14,4) NOT NULL DEFAULT 0,
  satuan         VARCHAR(20) NOT NULL,             -- Omega.Satuan.Satuan
  rasio          NUMERIC(14,4) NOT NULL DEFAULT 1, -- snapshot Omega.Satuan.Rasio
  catatan        TEXT,
  urutan         INTEGER NOT NULL DEFAULT 1,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_master_ingredient_item
  ON master_ingredient_item(ingredient_id, bahan_kode, satuan);
CREATE INDEX IF NOT EXISTS idx_master_ingredient_item_ing ON master_ingredient_item(ingredient_id);
CREATE INDEX IF NOT EXISTS idx_master_ingredient_item_bahan ON master_ingredient_item(bahan_kode);
