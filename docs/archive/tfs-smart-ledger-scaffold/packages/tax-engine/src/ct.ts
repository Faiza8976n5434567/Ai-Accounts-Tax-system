/**
 * UAE Corporate Tax computation: accounting profit → taxable income → CT payable.
 * Ported from the firm's reviewed Python calculator. Does the arithmetic; the tax
 * professional does the judgement. Amounts in fils.
 */
import { applyRateBp, type Fils } from "./money";
import { CURRENT_CONFIG, type UaeTaxConfig } from "./config/uae-tax-config";
import { ctReturnDue } from "./deadlines";

export type CtRegime = "standard" | "sbr" | "qfzp";

export interface CtInput {
  taxPeriodEnd: string; // yyyy-mm-dd
  regime: CtRegime;
  revenueCurrent: Fils;
  revenuePriorPeriods?: Fils[];
  isMneGroupMember?: boolean;
  isTaxGroup?: boolean;
  accountingProfit: Fils;
  exemptIncome?: Fils;
  entertainmentClient?: Fils;
  finesPenalties?: Fils;
  donationsNonQpbe?: Fils;
  otherDisallowed?: Fils;
  connectedPersonExcess?: Fils;
  tpAdjustment?: Fils;
  specificInterestDisallowed?: Fils;
  otherAdjustments?: Fils;
  interestExpense?: Fils;
  interestIncome?: Fils;
  depreciationAmortisation?: Fils;
  interestCfBf?: Fils;
  isBankOrInsurer?: boolean;
  lossesBf?: Fils;
  qfzpQualifyingIncome?: Fils;
  qfzpNonQualifyingRevenue?: Fils;
  qfzpTotalRevenue?: Fils;
  foreignTaxCredit?: Fils;
  rdCredit?: Fils;
  otherCredits?: Fils;
}

export interface CtLine { label: string; amount: Fils; basis: string }
export interface CtResult {
  configVersion: string;
  lines: CtLine[];
  taxableIncome: Fils;
  ctPayable: Fils;
  dueDate: string;
  sbrEligible: boolean;
  carryForwards: { taxLossCf: Fils; disallowedInterestCf?: Fils; rdCreditCf?: Fils; otherCreditsCf?: Fils };
  warnings: string[];
}

const z = (v?: Fils) => v ?? 0;

export function computeCt(inp: CtInput, cfg: UaeTaxConfig = CURRENT_CONFIG): CtResult {
  const c = cfg.ct;
  const lines: CtLine[] = [];
  const warnings: string[] = [];
  const carry: CtResult["carryForwards"] = { taxLossCf: 0 };
  const line = (label: string, amount: Fils, basis = "") => lines.push({ label, amount, basis });
  const dueDate = ctReturnDue(inp.taxPeriodEnd, cfg);

  // ── SBR gate ──
  const sbrEligible =
    inp.revenueCurrent <= c.sbrRevenueLimit.value &&
    (inp.revenuePriorPeriods ?? []).every((r) => r <= c.sbrRevenueLimit.value) &&
    inp.taxPeriodEnd <= c.sbrLastPeriodEnd.value &&
    !inp.isMneGroupMember &&
    inp.regime !== "qfzp";

  if (inp.regime === "sbr") {
    if (!sbrEligible) {
      warnings.push("SBR elected but eligibility FAILS (current/prior revenue, period end, MNE member or QFZP). Recompute under standard regime.");
    } else {
      line("Small Business Relief elected — taxable income treated as nil", 0, `${c.sbrRevenueLimit.ref}; ${c.sbrLastPeriodEnd.ref}`);
      warnings.push("Losses and disallowed net interest arising in this period cannot be carried forward.");
      return { configVersion: cfg.version, lines, taxableIncome: 0, ctPayable: 0, dueDate, sbrEligible, carryForwards: carry, warnings };
    }
  } else if (sbrEligible && inp.regime === "standard") {
    warnings.push("Entity appears ELIGIBLE for SBR — consider electing (unless deliberately preserving losses).");
  }

  // ── QFZP de minimis ──
  if (inp.regime === "qfzp") {
    const tot = z(inp.qfzpTotalRevenue);
    const nq = z(inp.qfzpNonQualifyingRevenue);
    const limit = tot ? Math.min(c.qfzpDeMinimisAbs.value, applyRateBp(tot, c.qfzpDeMinimisPctBp.value)) : c.qfzpDeMinimisAbs.value;
    warnings.push(nq > limit
      ? `QFZP de minimis BREACHED (${nq / 100} > ${limit / 100} AED): QFZP status lost for this and the next 4 periods — compute under standard regime.`
      : `De minimis OK (${nq / 100} ≤ ${limit / 100} AED). All other QFZP conditions must still be confirmed.`);
  }

  // ── Bridge ──
  let ti = inp.accountingProfit;
  line("Accounting net profit before tax", ti, "Art 20");
  const adjustments: [string, Fils, string][] = [
    ["Less: exempt income", -z(inp.exemptIncome), "Art 22–24"],
    ["Add: disallowed portion of client entertainment", applyRateBp(z(inp.entertainmentClient), c.entertainmentDisallowBp.value), c.entertainmentDisallowBp.ref],
    ["Add: fines and penalties", z(inp.finesPenalties), "Art 33"],
    ["Add: donations to non-qualifying public benefit entities", z(inp.donationsNonQpbe), "Art 33"],
    ["Add: other disallowed expenditure", z(inp.otherDisallowed), "Art 28/33"],
    ["Add: connected-person payments above market value", z(inp.connectedPersonExcess), "Art 36"],
    ["Transfer pricing adjustment", z(inp.tpAdjustment), "Art 34"],
    ["Add: specific interest disallowance", z(inp.specificInterestDisallowed), "Art 31"],
    ["Other adjustments (transitional / realisation)", z(inp.otherAdjustments), "Art 20/61"],
  ];
  for (const [label, amt, basis] of adjustments) if (amt) { line(label, amt, basis); ti += amt; }

  // ── General interest limitation ──
  const nie = z(inp.interestExpense) - z(inp.specificInterestDisallowed) - z(inp.interestIncome);
  const cfBf = z(inp.interestCfBf);
  if (!inp.isBankOrInsurer && (nie > 0 || cfBf > 0)) {
    const ebitda = ti + Math.max(nie, 0) + z(inp.depreciationAmortisation);
    const cap = Math.max(c.interestDeMinimis.value, applyRateBp(Math.max(ebitda, 0), c.interestEbitdaPctBp.value));
    const allowed = Math.min(Math.max(nie, 0) + cfBf, cap);
    const disallowedCurrent = Math.max(Math.max(nie, 0) - cap, 0);
    const usedBf = Math.max(allowed - Math.max(nie, 0), 0);
    if (disallowedCurrent) { line("Add: net interest above limit (carried forward)", disallowedCurrent, c.interestDeMinimis.ref); ti += disallowedCurrent; }
    if (usedBf) { line("Less: brought-forward disallowed interest utilised", -usedBf, "Art 30"); ti -= usedBf; }
    carry.disallowedInterestCf = cfBf - usedBf + disallowedCurrent;
    if (cfBf) warnings.push("Check the 10-period expiry of brought-forward disallowed interest.");
  }

  if (inp.regime === "qfzp") { const qi = z(inp.qfzpQualifyingIncome); line("Less: Qualifying Income (0%)", -qi, "Art 18; CD 100/2023"); ti -= qi; }
  line("Taxable income before loss relief", ti);

  // ── Losses ──
  const losses = z(inp.lossesBf);
  let lossUsed = 0;
  if (ti > 0 && losses > 0) {
    lossUsed = Math.min(losses, applyRateBp(ti, c.lossReliefCapBp.value));
    line("Less: tax loss relief (max 75%)", -lossUsed, c.lossReliefCapBp.ref);
    ti -= lossUsed;
  }
  const taxableIncome = Math.max(ti, 0);
  carry.taxLossCf = losses - lossUsed + (ti < 0 ? -ti : 0);
  line("Taxable income", taxableIncome);

  // ── Rate ──
  let ct: Fils;
  if (inp.regime === "qfzp") {
    ct = applyRateBp(taxableIncome, c.rateBp.value);
    line("CT at 9% on non-qualifying taxable income (no 0% band)", ct, "Art 3; CD 100/2023");
  } else {
    ct = applyRateBp(Math.max(taxableIncome - c.zeroRateBand.value, 0), c.rateBp.value);
    line("0% on first AED 375,000", 0, c.zeroRateBand.ref);
    line("9% on excess", ct, c.rateBp.ref);
    if (inp.isTaxGroup) warnings.push("Tax group: the AED 375,000 band applies once for the group.");
  }

  // ── Credits ──
  const credits: [string, keyof CtInput, string, keyof CtResult["carryForwards"] | null][] = [
    ["Less: foreign tax credit", "foreignTaxCredit", "Art 47", null],
    ["Less: R&D tax credit", "rdCredit", "CD 215/2025 — VERIFY", "rdCreditCf"],
    ["Less: other credits / incentives", "otherCredits", "Art 44", "otherCreditsCf"],
  ];
  for (const [label, key, basis, cfKey] of credits) {
    const amt = z(inp[key] as Fils | undefined);
    if (!amt) continue;
    const used = Math.min(amt, ct);
    line(label, -used, basis);
    ct -= used;
    if (amt > used) {
      if (cfKey) carry[cfKey] = amt - used;
      else warnings.push("Excess foreign tax credit is lost (no carry forward).");
    }
  }

  line("Corporate Tax payable", ct, "Art 48");
  return { configVersion: cfg.version, lines, taxableIncome, ctPayable: ct, dueDate, sbrEligible, carryForwards: carry, warnings };
}
