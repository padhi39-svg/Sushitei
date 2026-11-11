// Helper pivot (group-by berjenjang seperti Excel) yang dipakai bersama
// oleh halaman list/report agar perilakunya sama semua.

export type PivotNode = {
  key: string;
  value: string;
  depth: number;
  count: number;
  sum: Record<string, number>;
  children: PivotNode[];
  rows: any[];
};

export function buildPivotTree(
  rows: any[],
  fields: string[],
  numericKeys: string[],
  valueOf: (row: any, field: string) => string
): PivotNode {
  const makeSum = (rs: any[]): Record<string, number> => {
    const s: Record<string, number> = {};
    for (const k of numericKeys) {
      let t = 0;
      for (const r of rs) t += Number(r[k] || 0);
      s[k] = t;
    }
    return s;
  };

  const root: PivotNode = {
    key: "",
    value: "",
    depth: -1,
    count: rows.length,
    sum: makeSum(rows),
    children: [],
    rows: [],
  };
  if (!fields.length) {
    root.rows = rows;
    return root;
  }

  const build = (node: PivotNode, subset: any[], depth: number) => {
    const field = fields[depth];
    const seen = new Map<string, any[]>();
    for (const r of subset) {
      const v = valueOf(r, field) || "(kosong)";
      if (!seen.has(v)) seen.set(v, []);
      seen.get(v)!.push(r);
    }
    node.children = Array.from(seen.entries()).map(([v, sub]) => {
      const key = (node.key ? node.key + "|" : "") + field + "=" + v;
      const child: PivotNode = {
        key,
        value: v,
        depth,
        count: sub.length,
        sum: makeSum(sub),
        children: [],
        rows: [],
      };
      if (depth + 1 < fields.length) build(child, sub, depth + 1);
      else child.rows = sub;
      return child;
    });
  };

  build(root, rows, 0);
  return root;
}
