"use client";

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";

export default function ResponsiveReportTable({
  children,
  className = "",
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    wrapper.querySelectorAll("table").forEach((table) => {
      const headers = Array.from(table.querySelectorAll("thead tr:first-child th"));
      table.querySelectorAll("tbody tr, tfoot tr").forEach((row) => {
        let columnIndex = 0;
        Array.from(row.querySelectorAll(":scope > td")).forEach((cell) => {
          const span = Math.max(1, (cell as HTMLTableCellElement).colSpan || 1);
          const header = headers[columnIndex];
          const headerCopy = header?.cloneNode(true) as HTMLElement | undefined;
          headerCopy?.querySelectorAll(".absolute, button, input, svg").forEach((element) => element.remove());
          const label = span > 1
            ? "Ringkasan"
            : (headerCopy?.textContent || "").replace(/[▲▼⇅▾]/g, "").replace(/\s+/g, " ").trim();
          if (label) cell.setAttribute("data-label", label);
          else cell.removeAttribute("data-label");
          columnIndex += span;
        });
      });
    });
  });

  return (
    <div ref={wrapperRef} className={`report-table-wrapper responsive-report-table-wrapper ${className}`} style={style}>
      {children}
    </div>
  );
}
