"use client";

type Props = {
  children: React.ReactNode;
  className?: string;
};

/**
 * Pembungkus tabel responsive:
 * - Desktop (>= md): tabel seperti biasa
 * - Mobile (< md): disembunyikan, diganti kartu (children kedua)
 */
export default function ResponsiveTable({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={`hidden md:block ${className}`}>{children}</div>;
}
