import { AR } from "./ar";

export type Lang = "en" | "ar";
const missing = new Set<string>();

/** Translate an English key; `{name}` placeholders are filled from params. Falls back to English. */
export function t(lang: Lang, s: string, p?: Record<string, string | number>) {
  let out = s;
  if (lang === "ar") {
    const hit = AR[s];
    if (hit === undefined && import.meta.env.DEV) { missing.add(s); (window as unknown as { __i18nMissing: string[] }).__i18nMissing = [...missing]; }
    out = hit ?? s;
  }
  if (p) for (const [k, v] of Object.entries(p)) out = out.split(`{${k}}`).join(String(v));
  return out;
}

export const monthShort = (ym: string, lang: Lang) => new Date(ym.slice(0, 7) + "-01T00:00:00").toLocaleString(lang === "ar" ? "ar-AE" : "en", { month: "short" });
export const monthLong = (ym: string, lang: Lang) => new Date(ym.slice(0, 7) + "-01T00:00:00").toLocaleString(lang === "ar" ? "ar-AE" : "en", { month: "long", year: "numeric", numberingSystem: "latn" });
export const fmtDate = (d: string, lang: Lang) => new Date(d + "T00:00:00").toLocaleDateString(lang === "ar" ? "ar-AE" : "en-GB", { day: "numeric", month: "short", year: "numeric", numberingSystem: "latn" });
export const weekday = (d: string, lang: Lang) => new Date(d + "T00:00:00").toLocaleString(lang === "ar" ? "ar-AE" : "en", { weekday: "short" });
