import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { masterIngredient, masterIngredientItem } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { getCurrentUserServer } from "@/lib/auth";
import { resolveIngredientInput } from "@/lib/ingredient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ImportItem = {
  bahanKode: string;
  qty: number;
  satuan: string;
  catatan: string;
  baris: number;
};

type ImportGroup = {
  barangKode: string;
  name: string;
  portion: string;
  aktif: string;
  description: string;
  items: ImportItem[];
  errors: string[];
};

function toNumber(value: any): number {
  if (typeof value === "number") return value;
  let text = String(value ?? "").trim();
  if (!text) return NaN;
  if (text.includes(",") && text.includes(".")) {
    if (text.lastIndexOf(",") > text.lastIndexOf(".")) {
      text = text.replace(/\./g, "").replace(",", ".");
    } else {
      text = text.replace(/,/g, "");
    }
  } else if (text.includes(",")) {
    // Format Indonesia: 0,25 = desimal; 1,234 = ribuan.
    text = /^\d{1,3}(,\d{3})+$/.test(text)
      ? text.replace(/,/g, "")
      : text.replace(",", ".");
  }
  text = text.replace(/\s/g, "");
  return Number(text);
}

function parseAktif(value: any): string {
  const text = String(value ?? "").trim().toLowerCase();
  if (!text) return "1";
  if (["0", "no", "n", "tidak", "false", "nonaktif", "non aktif", "inactive"].includes(text)) return "0";
  return "1";
}

// POST /api/ingredient/import
// form-data: file (.xlsx/.xls/.csv), updateExisting (0/1)
// Template datar: satu baris = satu bahan. Baris dengan Kode Barang sama digabung menjadi satu resep.
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "File Excel wajib dipilih" }, { status: 400 });
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "Ukuran file maksimal 10 MB" }, { status: 400 });
    }

    const updateExisting = String(form.get("updateExisting") || "0") === "1";
    const buf = Buffer.from(await file.arrayBuffer());
    const XLSX = await import("xlsx");
    const wb = XLSX.read(buf, { type: "buffer" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    if (!ws) return NextResponse.json({ error: "File tidak memiliki sheet" }, { status: 400 });

    // raw:false mempertahankan teks tampilan (mis. "0,25") agar desimal koma tidak
    // berubah menjadi 25 oleh parser CSV.
    const json = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: "", raw: false });
    if (!json.length) return NextResponse.json({ error: "Sheet Excel kosong" }, { status: 400 });

    const pick = (row: Record<string, any>, ...names: string[]) => {
      const keys = Object.keys(row);
      for (const name of names) {
        const key = keys.find((k) => k.trim().toLowerCase() === name.trim().toLowerCase());
        if (key && String(row[key] ?? "").trim() !== "") return String(row[key]).trim();
      }
      return "";
    };

    const groups = new Map<string, ImportGroup>();
    const parseErrors: { baris: number; pesan: string }[] = [];

    json.forEach((row, index) => {
      const baris = index + 2; // baris 1 = header
      const barangKode = pick(row, "Kode Barang", "Kode Barang Jadi", "Barang", "Kode");
      const bahanKode = pick(row, "Kode Bahan", "Kode Bahan Baku", "Bahan", "Kode Bahan Baku");
      const qtyRaw = pick(row, "Qty", "Jumlah", "Quantity");
      const satuan = pick(row, "Satuan", "Unit", "UOM");

      // Lewati baris yang benar-benar kosong.
      if (!barangKode && !bahanKode && !qtyRaw && !satuan) return;

      if (!barangKode) {
        parseErrors.push({ baris, pesan: "Kode Barang wajib diisi" });
        return;
      }

      let group = groups.get(barangKode);
      if (!group) {
        group = {
          barangKode,
          name: pick(row, "Nama Barang", "Nama Barang Jadi", "Nama"),
          portion: pick(row, "Porsi", "Portion"),
          aktif: parseAktif(pick(row, "Aktif", "Status")),
          description: pick(row, "Deskripsi", "Description", "Keterangan"),
          items: [],
          errors: [],
        };
        groups.set(barangKode, group);
      } else {
        // Lengkapi header dari baris berikutnya bila baris pertama kosong.
        if (!group.name) group.name = pick(row, "Nama Barang", "Nama Barang Jadi", "Nama");
        if (!group.portion) group.portion = pick(row, "Porsi", "Portion");
        if (!group.description) group.description = pick(row, "Deskripsi", "Description", "Keterangan");
      }

      if (!bahanKode) {
        group.errors.push(`Baris ${baris}: Kode Bahan wajib diisi`);
        return;
      }
      const qty = toNumber(qtyRaw);
      if (!Number.isFinite(qty) || qty <= 0) {
        group.errors.push(`Baris ${baris}: Qty "${qtyRaw}" harus lebih dari 0`);
        return;
      }
      if (!satuan) {
        group.errors.push(`Baris ${baris}: Satuan wajib diisi untuk bahan ${bahanKode}`);
        return;
      }

      group.items.push({
        bahanKode,
        qty,
        satuan,
        catatan: pick(row, "Catatan", "Note", "Keterangan Bahan"),
        baris,
      });
    });

    const groupList = Array.from(groups.values());
    if (!groupList.length) {
      return NextResponse.json(
        { error: "Tidak ada baris resep yang bisa diproses", errors: parseErrors },
        { status: 400 }
      );
    }
    if (groupList.length > 1000) {
      return NextResponse.json({ error: "Maksimal 1.000 resep per file" }, { status: 400 });
    }

    const kodes = groupList.map((g) => g.barangKode);
    const existingRows = await db
      .select({
        id: masterIngredient.id,
        code: masterIngredient.code,
        barangKode: masterIngredient.barangKode,
      })
      .from(masterIngredient)
      .where(and(inArray(masterIngredient.barangKode, kodes), eq(masterIngredient.isdelete, 0)));
    const existingMap = new Map(existingRows.map((r) => [r.barangKode, r]));

    const user = await getCurrentUserServer();
    const errors: { baris: number | null; pesan: string }[] = [...parseErrors];
    let created = 0;
    let updated = 0;
    let importedItems = 0;

    for (const group of groupList) {
      const firstRow = group.items[0]?.baris ?? null;
      if (group.errors.length) {
        errors.push({ baris: firstRow, pesan: `${group.barangKode}: ${group.errors.join("; ")}` });
        continue;
      }
      if (!group.items.length) {
        errors.push({ baris: firstRow, pesan: `${group.barangKode}: tidak memiliki bahan` });
        continue;
      }

      const existing = existingMap.get(group.barangKode);
      if (existing && !updateExisting) {
        errors.push({
          baris: firstRow,
          pesan: `${group.barangKode}: resep sudah ada (${existing.code}). Centang "Perbarui resep yang sudah ada" untuk menggantinya.`,
        });
        continue;
      }

      const resolved = await resolveIngredientInput({
        barangKode: group.barangKode,
        name: group.name,
        portion: group.portion || 1,
        aktif: group.aktif === "1",
        description: group.description,
        items: group.items.map((it) => ({
          bahanKode: it.bahanKode,
          qty: it.qty,
          satuan: it.satuan,
          catatan: it.catatan,
        })),
      });
      if ("error" in resolved) {
        errors.push({ baris: firstRow, pesan: `${group.barangKode}: ${resolved.error}` });
        continue;
      }

      const data = resolved.data;
      const itemValues = data.items.map((it) => ({
        bahanKode: it.bahanKode,
        qty: String(it.qty),
        satuan: it.satuan,
        rasio: String(it.rasio),
        catatan: it.catatan,
        urutan: it.urutan,
      }));

      try {
        await db.transaction(async (tx) => {
          if (existing) {
            await tx
              .update(masterIngredient)
              .set({
                name: data.name,
                portion: data.portion,
                description: data.description,
                aktif: data.aktif,
                userEdit: user?.id ?? null,
                updatedAt: new Date(),
              })
              .where(eq(masterIngredient.id, existing.id));
            await tx
              .delete(masterIngredientItem)
              .where(eq(masterIngredientItem.ingredientId, existing.id));
            await tx.insert(masterIngredientItem).values(
              itemValues.map((it) => ({ ...it, ingredientId: existing.id }))
            );
          } else {
            const [header] = await tx
              .insert(masterIngredient)
              .values({
                barangKode: data.barangKode,
                name: data.name,
                portion: data.portion,
                description: data.description,
                aktif: data.aktif,
                userCreate: user?.id ?? null,
                userEdit: user?.id ?? null,
              })
              .returning({ id: masterIngredient.id });
            await tx.insert(masterIngredientItem).values(
              itemValues.map((it) => ({ ...it, ingredientId: header.id }))
            );
          }
        });
        if (existing) updated++;
        else created++;
        importedItems += itemValues.length;
      } catch (e: any) {
        if (e?.code === "23505") {
          errors.push({
            baris: firstRow,
            pesan: `${group.barangKode}: resep sudah ada (duplikat).`,
          });
        } else {
          errors.push({
            baris: firstRow,
            pesan: `${group.barangKode}: ${e?.message || "gagal menyimpan resep"}`,
          });
        }
      }
    }

    if (!created && !updated) {
      return NextResponse.json(
        { error: "Semua resep gagal diimport", errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        recipes: created + updated,
        created,
        updated,
        items: importedItems,
        totalGroups: groupList.length,
        errors,
      },
      { status: 201 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Gagal import master ingredient" },
      { status: 500 }
    );
  }
}
