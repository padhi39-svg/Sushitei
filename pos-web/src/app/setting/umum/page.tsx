"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import ImageUploadField from "@/components/ImageUploadField";
import Spinner from "@/components/Spinner";
import { DEFAULT_SETTINGS, SETTING_META, type GeneralSettings } from "@/lib/settings";
import { notifyDataSaved } from "@/lib/save-feedback";

const GROUPS = ["Identitas", "Tema", "Background Login", "Footer"];

export default function PengaturanUmumPage() {
  const [values, setValues] = useState<GeneralSettings>({ ...DEFAULT_SETTINGS });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/settings", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        if (d?.settings) setValues({ ...DEFAULT_SETTINGS, ...d.settings });
      })
      .catch(() => {})
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  const set = (key: string, v: string) => {
    setValues((p) => ({ ...p, [key]: v } as GeneralSettings));
    setMsg(null);
  };

  const grouped = useMemo(() => {
    return GROUPS.map((g) => ({
      group: g,
      items: SETTING_META.filter((m) => m.group === g),
    })).filter((g) => g.items.length);
  }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: values }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) return setMsg({ ok: false, text: d?.error || "Gagal menyimpan" });
      if (d?.settings) setValues({ ...DEFAULT_SETTINGS, ...d.settings });
      setMsg(null);
      notifyDataSaved("Pengaturan berhasil disimpan.");
    } catch {
      setMsg({ ok: false, text: "Gagal menyimpan" });
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="w-full max-w-[1520px] mx-auto">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="w-full max-w-[1520px] mx-auto space-y-3">
      <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-base md:text-lg font-bold text-slate-800">Pengaturan Umum</h1>
            <p className="text-[11px] text-slate-600 mt-0.5">
              Identitas aplikasi, warna tema, background halaman login, dan footer.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {msg && (
              <span className={"text-xs font-semibold " + (msg.ok ? "text-emerald-600" : "text-red-600")}>
                {msg.text}
              </span>
            )}
            <button
              type="submit"
              form="form-setting-umum"
              disabled={saving}
              className="px-4 py-2 rounded-pill text-sm font-bold text-white bg-teal-primary hover:bg-teal-dark disabled:opacity-50"
            >
              {saving ? <><span className="inline-block h-3.5 w-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin mr-2 align-middle" />Menyimpan...</> : "Simpan Pengaturan"}
            </button>
          </div>
        </div>
      </div>

      <form id="form-setting-umum" onSubmit={save} className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {grouped.map((g) => (
          <section key={g.group} className="bg-white rounded-lg shadow-sm border border-slate-200 p-3 space-y-3">
            <h2 className="text-sm font-bold text-slate-800 border-b border-dashed border-slate-200 pb-2">{g.group}</h2>

            {g.items.map((m) => {
              if (m.type === "color") {
                return (
                  <div key={m.key}>
                    <label className="block text-xs font-bold text-[#3C3C3C] mb-1">{m.label}</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={(values as any)[m.key] || "#000000"}
                        onChange={(e) => set(m.key, e.target.value)}
                        className="h-9 w-12 rounded-lg border border-slate-300 bg-white p-1 cursor-pointer"
                      />
                      <input
                        type="text"
                        value={(values as any)[m.key] || ""}
                        onChange={(e) => set(m.key, e.target.value)}
                        className="flex-1 px-2.5 py-1.5 rounded-lg text-xs outline-none border border-slate-300 bg-white focus:ring-2 focus:ring-teal-bg focus:border-teal-primary"
                      />
                    </div>
                    {m.description && <p className="text-[11px] text-slate-500 mt-1">{m.description}</p>}
                  </div>
                );
              }

              if (m.type === "select") {
                return (
                  <div key={m.key}>
                    <label className="block text-xs font-bold text-[#3C3C3C] mb-1">{m.label}</label>
                    <select
                      value={(values as any)[m.key] || ""}
                      onChange={(e) => set(m.key, e.target.value)}
                      className="w-full px-2.5 py-2 rounded-lg text-xs outline-none border border-slate-300 bg-white focus:ring-2 focus:ring-teal-bg focus:border-teal-primary"
                    >
                      {(m.options || []).map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                    {m.description && <p className="text-[11px] text-slate-500 mt-1">{m.description}</p>}
                  </div>
                );
              }

              if (m.type === "number") {
                return (
                  <div key={m.key}>
                    <label className="block text-xs font-bold text-[#3C3C3C] mb-1">{m.label}</label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={1}
                      value={Math.round(Number((values as any)[m.key] || 0) * 100)}
                      onChange={(e) => set(m.key, String(Number(e.target.value || 0) / 100))}
                      className="w-full px-2.5 py-2 rounded-lg text-xs outline-none border border-slate-300 bg-white focus:ring-2 focus:ring-teal-bg focus:border-teal-primary"
                    />
                    {m.description && <p className="text-[11px] text-slate-500 mt-1">{m.description}</p>}
                  </div>
                );
              }

              if (m.type === "image") {
                return (
                  <ImageUploadField
                    key={m.key}
                    label={m.label}
                    hint={m.description}
                    kind={m.key === "logoUrl" ? "logo" : m.key === "loginBgImage" ? "background" : "general"}
                    preview={m.key === "loginBgImage" ? "wide" : "square"}
                    value={(values as any)[m.key] || ""}
                    onChange={(v) => set(m.key, v)}
                  />
                );
              }

              return (
                <div key={m.key}>
                  <label className="block text-xs font-bold text-[#3C3C3C] mb-1">{m.label}</label>
                  <input
                    type="text"
                    value={(values as any)[m.key] || ""}
                    onChange={(e) => set(m.key, e.target.value)}
                    className="w-full px-2.5 py-2 rounded-lg text-xs outline-none border border-slate-300 bg-white focus:ring-2 focus:ring-teal-bg focus:border-teal-primary"
                  />
                  {m.description && <p className="text-[11px] text-slate-500 mt-1">{m.description}</p>}
                </div>
              );
            })}
          </section>
        ))}

        {/* Preview Login */}
        <section className="bg-white rounded-lg shadow-sm border border-slate-200 p-3 space-y-2">
          <h2 className="text-sm font-bold text-slate-800 border-b border-dashed border-slate-200 pb-2">
            Preview Halaman Login
          </h2>
          <div
            className="relative rounded-xl overflow-hidden border border-slate-200 h-56"
            style={previewBg(values)}
          >
            <div className="absolute inset-0" style={{ backgroundColor: "#000000", opacity: values.loginBgOverlay }} />
            <div className="relative h-full grid grid-cols-2">
              <div className="hidden sm:flex items-start justify-center pt-4">
                <div className="text-center text-white">
                  {values.logoUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={values.logoUrl} alt="logo" className="h-10 w-10 object-contain mx-auto mb-1" />
                  )}
                  <div className="text-sm font-bold uppercase tracking-widest" style={{ textShadow: "0 2px 4px rgba(0,0,0,0.5)" }}>
                    {values.appName}
                  </div>
                  {values.appSubtitle && (
                    <div className="text-[9px] opacity-90 mt-0.5">{values.appSubtitle}</div>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-center p-3">
                <div className="w-full max-w-[230px] rounded-2xl p-3 bg-[#FBF8F3] shadow-lg">
                  <div className="text-center">
                    <div className="text-sm font-bold" style={{ color: values.primaryColorDark }}>
                      {values.welcomeTitle || "Sign In"}
                    </div>
                    {values.welcomeSubtitle && (
                      <p className="text-[9px] text-slate-500 mt-0.5">{values.welcomeSubtitle}</p>
                    )}
                  </div>
                  <div className="mt-2 space-y-1.5">
                    <div className="h-6 rounded-[8px] bg-white border border-slate-200" />
                    <div className="h-6 rounded-[8px] bg-white border border-slate-200" />
                    <div className="h-6 rounded-[8px]" style={{ backgroundColor: values.primaryColor }} />
                  </div>
                </div>
              </div>
            </div>
          </div>
          {values.footerText && (
            <p className="text-[11px] text-slate-600 text-center">{values.footerText}</p>
          )}
          {values.footerCopyright && (
            <p className="text-[10px] text-slate-400 text-center">{values.footerCopyright}</p>
          )}
        </section>
      </form>
    </div>
  );
}

function previewBg(s: GeneralSettings): React.CSSProperties {
  switch (s.loginBgType) {
    case "color":
      return { backgroundColor: s.loginBgColor || "#0ea5e9" };
    case "gradient":
      return {
        backgroundImage: `linear-gradient(135deg, ${s.loginBgColor || "#0ea5e9"} 0%, ${s.loginBgColor2 || "#2BA8A2"} 100%)`,
      };
    case "image":
      return s.loginBgImage
        ? { backgroundImage: `url("${s.loginBgImage}")`, backgroundSize: "cover", backgroundPosition: "center" }
        : { backgroundColor: s.loginBgColor || "#0ea5e9" };
    case "url":
      return s.loginBgUrl
        ? { backgroundImage: `url("${s.loginBgUrl}")`, backgroundSize: "cover", backgroundPosition: "center" }
        : { backgroundColor: s.loginBgColor || "#0ea5e9" };
    default:
      return { backgroundColor: s.loginBgColor || "#0ea5e9" };
  }
}
