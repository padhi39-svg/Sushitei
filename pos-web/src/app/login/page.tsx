"use client";
import { useEffect, useState } from "react";
import { DEFAULT_SETTINGS, type GeneralSettings } from "@/lib/settings";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [settings, setSettings] = useState<GeneralSettings>({ ...DEFAULT_SETTINGS });
const [cabangOptions, setCabangOptions] = useState<string[]>([]);
const [selectedCabang, setSelectedCabang] = useState("");
const [showCabangSelect, setShowCabangSelect] = useState(false);

  // Ambil pengaturan umum (publik, tanpa login)
  useEffect(() => {
    fetch("/api/settings?public=1", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (d?.settings) setSettings({ ...DEFAULT_SETTINGS, ...d.settings });
      })
      .catch(() => {});
  }, []);

  // Kalau sudah punya session, langsung ke halaman tujuan
  useEffect(() => {
    try {
      const hasSession = document.cookie.split(";").some((c) => c.trim().startsWith("session_token="));
      if (hasSession) {
        const sp = new URLSearchParams(window.location.search);
        let next = sp.get("next") || "/dashboard";
        if (!next.startsWith("/") || next.startsWith("/login")) next = "/dashboard";
        window.location.replace(next);
      }
    } catch {}
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return setError("Email dan Password wajib diisi");
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }), credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return setError(data?.error || "Gagal login");
      if (data?.needCabangSelection) {
        const sp2 = new URLSearchParams(window.location.search);
        const next = sp2.get("next") || "/dashboard";
        window.location.href = `/select-cabang?next=${encodeURIComponent(next)}`;
        return;
      }
      const sp = new URLSearchParams(window.location.search);
      let next = sp.get("next") || "/dashboard";
      if (!next.startsWith("/") || next.startsWith("/login")) next = "/dashboard";
      window.location.href = next;
    } catch { setError("Gagal login"); } finally { setLoading(false); }
  };

  const confirmCabang = async () => {
    if (!selectedCabang) return setError("Pilih cabang terlebih dahulu");
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/auth/select-cabang", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cabang: selectedCabang }), credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return setError(data?.error || "Gagal memilih cabang");
      const sp = new URLSearchParams(window.location.search);
      let next = sp.get("next") || "/dashboard";
      if (!next.startsWith("/") || next.startsWith("/login")) next = "/dashboard";
      window.location.href = next;
    } catch { setError("Gagal memilih cabang"); } finally { setLoading(false); }
  };

  const bg = loginBackgroundStyle(settings);
  const accent = settings.primaryColor || "#14532D";
  const accentDark = settings.primaryColorDark || "#1F3D2B";

  return (
    <div className="login-root min-h-screen relative overflow-hidden">
      {/* ===== LATAR HALAMAN ===== */}
      <div className="absolute inset-0" style={bg} />
      {settings.loginBgType !== "color" && (
        <div className="absolute inset-0" style={{ backgroundColor: "#000000", opacity: settings.loginBgOverlay }} />
      )}

      {/* Pola Seigaiha (gelombang jepang) di kanan atas */}
      <SeigaihaPattern className="absolute top-0 right-0 w-[420px] h-[420px] opacity-[0.07] pointer-events-none" />

      <div className="relative min-h-screen grid grid-cols-1 lg:grid-cols-2">
        {/* ================= KIRI: foto + logo ================= */}
        <div className="relative hidden lg:flex items-start justify-center pt-16 pb-16 px-10">
          {/* Logo besar di atas foto */}
          <div className="relative z-10 flex flex-col items-center text-center">
            <BrandMark
              logoUrl={settings.logoUrl}
              name={settings.appName || "Sushi Tei"}
              tagline={settings.appSubtitle || "A Good Deal of Sushi"}
              color="#FFFFFF"
              variant="stack"
            />
          </div>

          {/* Gradasi gelap di bawah agar logo terbaca di atas foto terang */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-black/25 pointer-events-none" />
        </div>

        {/* ================= KANAN: kartu form ================= */}
        <div className="flex items-center justify-center p-4 sm:p-8">
          <div className="login-card relative w-full max-w-[520px] rounded-[28px] bg-[#FBF8F3] shadow-[0_24px_60px_-12px_rgba(0,0,0,0.35)] overflow-hidden">
            {/* Motif gelombang + pagoda di bawah kanan kartu */}
            <div className="pointer-events-none absolute bottom-0 right-0 w-[320px] h-[190px] opacity-[0.5]">
              <WaveMotif />
            </div>

            <div className="relative z-10 px-8 sm:px-12 py-10 sm:py-12">
              {/* Logo di dalam kartu */}
              <div className="flex justify-center mb-6">
                <BrandMark
                  logoUrl={settings.logoUrl}
                  name={settings.appName || "Sushi Tei"}
                  tagline={settings.appSubtitle || "A Good Deal of Sushi"}
                  color={accentDark}
                  variant="inline"
                />
              </div>

              {/* Judul */}
              <h1
                className="text-center font-serif font-bold tracking-tight"
                style={{ color: accentDark, fontSize: "2.25rem", lineHeight: 1.15 }}
              >
                {settings.welcomeTitle || "Sign In"}
              </h1>
              <p className="text-center text-[15px] mt-1.5" style={{ color: "#6B7280" }}>
                {settings.welcomeSubtitle || "Masuk ke sistem"}
              </p>

              <form onSubmit={submit} className="mt-7 space-y-4">
                {/* Email */}
                <div>
                  <div className="relative">
                    <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 pointer-events-none" stroke="#9CA3AF" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      placeholder="Username"
                      className="login-input w-full pl-12 pr-4 py-3.5 rounded-[14px] text-[15px] outline-none transition-colors"
                    />
                  </div>
                </div>

                {/* Password */}
                <div>
                  <div className="relative">
                    <LockIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 pointer-events-none" stroke="#9CA3AF" />
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={6}
                      placeholder="Password"
                      className="login-input w-full pl-12 pr-12 py-3.5 rounded-[14px] text-[15px] outline-none transition-colors"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"}
                      className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 grid place-items-center rounded-lg hover:bg-black/5 transition-colors"
                    >
                      {showPassword ? (
                        <EyeOffIcon className="w-5 h-5" stroke="#6B7280" />
                      ) : (
                        <EyeIcon className="w-5 h-5" stroke="#6B7280" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Ingat saya */}
                <div className="flex items-center justify-between pt-1">
                  <label htmlFor="remember" className="flex items-center gap-2.5 text-[15px] cursor-pointer select-none" style={{ color: "#374151" }}>
                    <span className="relative grid place-items-center">
                      <input
                        id="remember"
                        type="checkbox"
                        className="peer sr-only"
                        defaultChecked
                      />
                      <span
                        className="w-[19px] h-[19px] rounded-[5px] border-2 grid place-items-center transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-offset-1"
                        style={{ borderColor: accent, backgroundColor: accent, color: "#fff" }}
                      >
                        <CheckIcon className="w-3 h-3 opacity-100" stroke="#fff" />
                      </span>
                    </span>
                    Ingat saya
                  </label>
                </div>

                {error && (
                  <p className="text-[13px] text-red-600 bg-red-50 border border-red-100 rounded-[10px] px-3 py-2">
                    {error}
                  </p>
                )}

                {/* Tombol Masuk */}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3.5 rounded-[14px] text-[16px] font-semibold text-white transition-all active:scale-[0.99] disabled:opacity-60 hover:brightness-110"
                  style={{ backgroundColor: accent, boxShadow: "0 10px 24px -8px " + accent + "66" }}
                >
                  {loading ? "Memproses..." : "Masuk"}
                </button>
              </form>

              <p className="text-[12px] text-center mt-6" style={{ color: "#9CA3AF" }}>
                Admin pertama: admin@yopmail.com / 123456 — ganti setelah login
              </p>
              {settings.footerText && (
                <p className="text-[12px] text-center mt-1.5" style={{ color: "#9CA3AF" }}>
                  {settings.footerText}
                </p>
              )}
              {settings.footerCopyright && (
                <p className="text-[11px] text-center mt-1" style={{ color: "#C4C4C4" }}>
                  {settings.footerCopyright}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   BrandMark - logo + nama + tagline
   ============================================================ */
function BrandMark({
  logoUrl, name, tagline, color, variant,
}: {
  logoUrl?: string;
  name: string;
  tagline?: string;
  color: string;
  variant: "stack" | "inline";
}) {
  const initials = name.trim().charAt(0).toUpperCase() || "S";

  if (variant === "stack") {
    return (
      <div className="flex flex-col items-center gap-3">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="logo" className="h-20 w-20 object-contain drop-shadow-[0_4px_10px_rgba(0,0,0,0.45)]" />
        ) : (
          <div
            className="h-16 w-16 rounded-2xl grid place-items-center font-serif font-bold text-3xl shadow-[0_6px_18px_rgba(0,0,0,0.35)]"
            style={{ backgroundColor: color, color: "#14532D" }}
          >
            {initials}
          </div>
        )}
        <div className="text-center">
          <div className="font-serif font-bold uppercase tracking-[0.18em] leading-tight" style={{ color, fontSize: "1.75rem" }}>
            {name}
          </div>
          {tagline && (
            <div className="mt-1 text-[15px] tracking-wide" style={{ color, opacity: 0.92, textShadow: "0 2px 6px rgba(0,0,0,0.4)" }}>
              {tagline}
            </div>
          )}
        </div>
      </div>
    );
  }

  // inline: logo kecil di kiri, nama + tagline di kanan
  return (
    <div className="flex items-center gap-4">
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logoUrl} alt="logo" className="h-16 w-16 shrink-0 object-contain" />
      ) : (
        <div
          className="h-16 w-16 shrink-0 rounded-xl grid place-items-center font-serif font-bold text-2xl"
          style={{ backgroundColor: color, color: "#FBF8F3" }}
        >
          {initials}
        </div>
      )}
      <div className="text-left leading-tight">
        <div className="font-serif font-bold uppercase tracking-[0.12em]" style={{ color, fontSize: "1.35rem" }}>
          {name}
        </div>
        {tagline && (
          <div className="text-[13px] tracking-wide" style={{ color, opacity: 0.85 }}>
            {tagline}
          </div>
        )}
      </div>
    </div>
  );
}

/* ============================================================
   Motif Gelombang (seigaiha) - SVG dekoratif
   ============================================================ */
function WaveMotif() {
  return (
    <svg viewBox="0 0 320 190" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      {/* Lengkungan ombak */}
      <g stroke="#D9CFC0" strokeWidth="1.4" fill="none" opacity="0.9">
        <path d="M0 190 Q40 130 80 190" />
        <path d="M30 190 Q70 130 110 190" />
        <path d="M60 190 Q100 130 140 190" />
        <path d="M90 190 Q130 130 170 190" />
        <path d="M120 190 Q160 130 200 190" />
        <path d="M150 190 Q190 130 230 190" />
        <path d="M180 190 Q220 130 260 190" />
        <path d="M210 190 Q250 130 290 190" />
        <path d="M240 190 Q280 130 320 190" />
      </g>
      {/* Lengkungan lebih lebar */}
      <g stroke="#E4DACB" strokeWidth="1.6" fill="none">
        <path d="M-10 190 Q55 105 120 190" />
        <path d="M40 190 Q105 105 170 190" />
        <path d="M90 190 Q155 105 220 190" />
        <path d="M140 190 Q205 105 270 190" />
        <path d="M190 190 Q255 105 330 190" />
      </g>
      {/* Pagoda / gerbang oriental */}
      <g fill="#D9CFC0" opacity="0.85">
        <path d="M232 190 v-26 h6 v-10 h-14 l14-12 -14-12 h30 l-14 12 14 12 h-14 v10 h6 v26 z" />
        <path d="M232 138 l-16-11 h32 z" />
        <path d="M232 118 l-13-9 h26 z" />
        <rect x="214" y="164" width="36" height="4" rx="1" />
      </g>
    </svg>
  );
}

/* ============================================================
   Pola Seigaiha untuk latar halaman
   ============================================================ */
function SeigaihaPattern({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 400 400" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <g stroke="#ffffff" strokeWidth="1.1" fill="none">
        {[0, 1, 2, 3, 4, 5].map((row) =>
          [0, 1, 2, 3, 4, 5, 6].map((col) => {
            const cx = col * 72 + (row % 2 ? 36 : 0);
            const cy = row * 72;
            return (
              <g key={`${row}-${col}`}>
                <circle cx={cx} cy={cy} r="30" />
                <circle cx={cx} cy={cy} r="22" />
                <circle cx={cx} cy={cy} r="14" />
                <circle cx={cx} cy={cy} r="7" />
              </g>
            );
          })
        )}
      </g>
    </svg>
  );
}

/* ============================================================
   Ikon SVG
   ============================================================ */
function UserIcon({ className, stroke }: { className?: string; stroke?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="12" cy="8" r="4" stroke={stroke} strokeWidth="1.8" />
      <path d="M4.5 20a7.5 7.5 0 0 1 15 0" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function LockIcon({ className, stroke }: { className?: string; stroke?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <rect x="4" y="10" width="16" height="10" rx="2" stroke={stroke} strokeWidth="1.8" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function EyeIcon({ className, stroke }: { className?: string; stroke?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" stroke={stroke} strokeWidth="1.8" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="3" stroke={stroke} strokeWidth="1.8" />
    </svg>
  );
}

function EyeOffIcon({ className, stroke }: { className?: string; stroke?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M3 3l18 18" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" />
      <path d="M10.6 6.1A9.9 9.9 0 0 1 12 6c6 0 9.5 6 9.5 6a16 16 0 0 1-3.3 3.9M6.6 7.3A16 16 0 0 0 2.5 12S6 18 12 18a9.6 9.6 0 0 0 3.4-.6" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function CheckIcon({ className, stroke }: { className?: string; stroke?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M5 12.5l4.5 4.5L19 7.5" stroke={stroke} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ============================================================
   Background sesuai Pengaturan Umum
   ============================================================ */
function loginBackgroundStyle(s: GeneralSettings): React.CSSProperties {
  switch (s.loginBgType) {
    case "color":
      return { backgroundColor: s.loginBgColor || "#14532D" };
    case "gradient":
      return {
        backgroundImage: `linear-gradient(135deg, ${s.loginBgColor || "#14532D"} 0%, ${s.loginBgColor2 || "#1F3D2B"} 100%)`,
        backgroundColor: s.loginBgColor || "#14532D",
      };
    case "image":
      return s.loginBgImage
        ? { backgroundImage: `url("${s.loginBgImage}")`, backgroundSize: "cover", backgroundPosition: "center" }
        : { backgroundColor: s.loginBgColor || "#14532D" };
    case "url":
      return s.loginBgUrl
        ? { backgroundImage: `url("${s.loginBgUrl}")`, backgroundSize: "cover", backgroundPosition: "center" }
        : { backgroundColor: s.loginBgColor || "#14532D" };
    default:
      return { backgroundColor: s.loginBgColor || "#14532D" };
  }
}
