import type { Account } from "./types";
// Subset of packages/db/seed/chart-of-accounts.uae-sme.json (IFRS-aligned UAE SME default).
export const COA: Account[] = [
  { code: "1010", nameEn: "Bank - current account (AED)", nameAr: "البنك - حساب جاري", type: "ASSET", group: "Cash & equivalents" },
  { code: "1100", nameEn: "Trade receivables", nameAr: "الذمم المدينة التجارية", type: "ASSET", group: "Receivables" },
  { code: "1150", nameEn: "Prepayments and deposits", nameAr: "مصروفات مدفوعة مقدماً", type: "ASSET", group: "Receivables" },
  { code: "1200", nameEn: "Inventory", nameAr: "المخزون", type: "ASSET", group: "Inventories" },
  { code: "1300", nameEn: "VAT input (recoverable)", nameAr: "ضريبة المدخلات", type: "ASSET", group: "Receivables" },
  { code: "1310", nameEn: "VAT input - reverse charge", nameAr: "ضريبة المدخلات - احتساب عكسي", type: "ASSET", group: "Receivables" },
  { code: "1500", nameEn: "Property, plant and equipment", nameAr: "الممتلكات والمعدات", type: "ASSET", group: "Non-current assets" },
  { code: "1510", nameEn: "PPE - accumulated depreciation", nameAr: "مجمع الإهلاك", type: "ASSET", group: "Non-current assets" },
  { code: "2000", nameEn: "Trade payables", nameAr: "الذمم الدائنة التجارية", type: "LIABILITY", group: "Payables" },
  { code: "2010", nameEn: "Accruals", nameAr: "مستحقات", type: "LIABILITY", group: "Payables" },
  { code: "2100", nameEn: "VAT output", nameAr: "ضريبة المخرجات", type: "LIABILITY", group: "Tax liabilities" },
  { code: "2110", nameEn: "VAT output - reverse charge", nameAr: "ضريبة المخرجات - احتساب عكسي", type: "LIABILITY", group: "Tax liabilities" },
  { code: "2200", nameEn: "Corporate tax payable", nameAr: "ضريبة الشركات المستحقة", type: "LIABILITY", group: "Tax liabilities" },
  { code: "2500", nameEn: "Provision for end-of-service benefits", nameAr: "مخصص مكافأة نهاية الخدمة", type: "LIABILITY", group: "Non-current liabilities" },
  { code: "3000", nameEn: "Share capital", nameAr: "رأس المال", type: "EQUITY", group: "Equity" },
  { code: "3200", nameEn: "Retained earnings", nameAr: "الأرباح المحتجزة", type: "EQUITY", group: "Equity" },
  { code: "4000", nameEn: "Revenue - sale of goods", nameAr: "إيرادات بيع البضائع", type: "REVENUE", group: "Revenue" },
  { code: "4010", nameEn: "Revenue - services", nameAr: "إيرادات الخدمات", type: "REVENUE", group: "Revenue" },
  { code: "4300", nameEn: "Other income", nameAr: "إيرادات أخرى", type: "REVENUE", group: "Other income" },
  { code: "5000", nameEn: "Cost of goods sold", nameAr: "تكلفة البضاعة المباعة", type: "EXPENSE", group: "Cost of sales" },
  { code: "5010", nameEn: "Direct costs - subcontractors", nameAr: "تكاليف مباشرة", type: "EXPENSE", group: "Cost of sales" },
  { code: "6000", nameEn: "Salaries and wages", nameAr: "الرواتب والأجور", type: "EXPENSE", group: "Staff costs" },
  { code: "6010", nameEn: "End-of-service benefits expense", nameAr: "مصروف مكافأة نهاية الخدمة", type: "EXPENSE", group: "Staff costs" },
  { code: "6050", nameEn: "Transportation and travel", nameAr: "النقل والسفر", type: "EXPENSE", group: "Operating expenses" },
  { code: "6060", nameEn: "Fuel and vehicle running", nameAr: "الوقود وتشغيل المركبات", type: "EXPENSE", group: "Operating expenses" },
  { code: "6100", nameEn: "Rent", nameAr: "الإيجار", type: "EXPENSE", group: "Operating expenses" },
  { code: "6110", nameEn: "Utilities and telecom", nameAr: "المرافق والاتصالات", type: "EXPENSE", group: "Operating expenses" },
  { code: "6120", nameEn: "Licences, visas and government fees", nameAr: "الرخص والتأشيرات", type: "EXPENSE", group: "Operating expenses" },
  { code: "6130", nameEn: "Professional fees", nameAr: "أتعاب مهنية", type: "EXPENSE", group: "Operating expenses" },
  { code: "6140", nameEn: "Client entertainment", nameAr: "ضيافة العملاء", type: "EXPENSE", ctTag: "ENTERTAINMENT_50", group: "Operating expenses" },
  { code: "6150", nameEn: "Marketing and advertising", nameAr: "التسويق والإعلان", type: "EXPENSE", group: "Operating expenses" },
  { code: "6160", nameEn: "Fines and penalties", nameAr: "الغرامات والجزاءات", type: "EXPENSE", ctTag: "FINES_PENALTIES", group: "Operating expenses" },
  { code: "6170", nameEn: "Donations", nameAr: "التبرعات", type: "EXPENSE", ctTag: "DONATION_NON_QPBE", group: "Operating expenses" },
  { code: "6180", nameEn: "Office supplies and IT", nameAr: "مستلزمات مكتبية", type: "EXPENSE", group: "Operating expenses" },
  { code: "6200", nameEn: "Depreciation - PPE", nameAr: "الإهلاك", type: "EXPENSE", group: "Depreciation" },
  { code: "6400", nameEn: "Bank charges", nameAr: "رسوم بنكية", type: "EXPENSE", group: "Finance costs" },
  { code: "6500", nameEn: "Non-deductible / personal expenses", nameAr: "مصروفات غير قابلة للخصم", type: "EXPENSE", ctTag: "NON_DEDUCTIBLE", group: "Operating expenses" },
  { code: "7000", nameEn: "Corporate tax expense", nameAr: "مصروف ضريبة الشركات", type: "EXPENSE", ctTag: "CT_EXPENSE", group: "Income tax" },
];
export const ACC = Object.fromEntries(COA.map((a) => [a.code, a])) as Record<string, Account>;
export const accName = (code: string, lang: "en" | "ar" = "en") => (ACC[code] ? (lang === "ar" ? ACC[code].nameAr : ACC[code].nameEn) : code);
export const EMIRATES: Record<string, string> = { AUH: "Abu Dhabi", DXB: "Dubai", SHJ: "Sharjah", AJM: "Ajman", UAQ: "Umm Al Quwain", RAK: "Ras Al Khaimah", FUJ: "Fujairah" };
export const EMIRATES_AR: Record<string, string> = { AUH: "أبوظبي", DXB: "دبي", SHJ: "الشارقة", AJM: "عجمان", UAQ: "أم القيوين", RAK: "رأس الخيمة", FUJ: "الفجيرة" };
export const emirateName = (k: string, lang: "en" | "ar") => (lang === "ar" ? EMIRATES_AR[k] : EMIRATES[k]) ?? k;
export const TAX_CODES: Record<string, { en: string; ar: string; tone: string }> = {
  SR: { en: "Standard 5%", ar: "أساسي 5%", tone: "emerald" },
  ZR: { en: "Zero-rated", ar: "نسبة صفر", tone: "sky" },
  EX: { en: "Exempt", ar: "معفى", tone: "slate" },
  OS: { en: "Out of scope", ar: "خارج النطاق", tone: "slate" },
  RCS: { en: "Reverse charge", ar: "احتساب عكسي", tone: "violet" },
  BLK: { en: "Blocked input", ar: "مدخلات محظورة", tone: "rose" },
};
