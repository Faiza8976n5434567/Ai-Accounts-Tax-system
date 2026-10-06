import { useStore } from "./store";
import { accName, emirateName, TAX_CODES } from "./coa";
import { monthShort, monthLong, fmtDate, weekday } from "./i18n";
import { AR } from "./ar";
import { RULE_SENTENCES } from "./rules";

/** One hook for every translated thing a page needs. */
export function useI18n() {
  const { t, lang } = useStore();
  const rtl = lang === "ar";
  return {
    t, lang, rtl,
    acc: (code: string) => accName(code, lang),
    accFull: (code: string) => `${code} · ${accName(code, lang)}`,
    mon: (ym: string) => monthShort(ym, lang),
    monLong: (ym: string) => monthLong(ym, lang),
    date: (d: string) => fmtDate(d, lang),
    wd: (d: string) => weekday(d, lang),
    em: (k: string) => emirateName(k, lang),
    tax: (k: string) => (TAX_CODES[k] ? (rtl ? TAX_CODES[k].ar : TAX_CODES[k].en) : k),
    orgName: (o: { name: string; nameAr: string }) => (rtl ? o.nameAr : o.name),
    /** Translate free text made of known sentences (AI reasoning, e-invoice log). */
    tx: (text?: string) => {
      if (!text || !rtl) return text ?? "";
      let out = text;
      for (const s of [...RULE_SENTENCES, ...Object.keys(AR).filter((k) => k.length > 24)]) if (out.includes(s) && AR[s]) out = out.split(s).join(AR[s]);
      return out;
    },
    /** Props for Recharts so time flows right-to-left in Arabic. */
    xDir: rtl ? { reversed: true } : {},
    yDir: rtl ? { orientation: "right" as const } : {},
  };
}
