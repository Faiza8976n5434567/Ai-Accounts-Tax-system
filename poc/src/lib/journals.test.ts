import { describe, expect, it } from "vitest";
import { checkDraft, friendlyDbError, journalActions, lineTotals, type AccountInfo, type EditorLine } from "./journals";

const accounts = new Map<string, AccountInfo>([
  ["rent", { id: "rent", code: "6100", is_control: false, is_active: true }],
  ["accr", { id: "accr", code: "2010", is_control: false, is_active: true }],
  ["bank", { id: "bank", code: "1010", is_control: true, is_active: true }],
  ["old", { id: "old", code: "6150", is_control: false, is_active: false }],
]);
const line = (accountId: string, debit = "", credit = "", description = ""): EditorLine => ({ accountId, debit, credit, description });

describe("lineTotals", () => {
  it("sums debits and credits in fils", () => expect(lineTotals([{ debit: 100000, credit: 0 }, { debit: 0, credit: 99999 }])).toEqual({ debit: 100000, credit: 99999, difference: 1 }));
});

describe("checkDraft — what the journal screen accepts", () => {
  it("LED-01 · Dr Rent 1,000 / Cr Accruals 1,000 is ready", () => {
    const r = checkDraft([line("rent", "1,000"), line("accr", "", "1000.00")], "manual", accounts);
    expect(r.problems).toEqual([]);
    expect(r.lines).toEqual([{ account_id: "rent", debit: 100000, credit: 0, description: "" }, { account_id: "accr", debit: 0, credit: 100000, description: "" }]);
  });
  it("LED-02 · 1,000.00 vs 999.99 is not balanced", () => expect(checkDraft([line("rent", "1000"), line("accr", "", "999.99")], "manual", accounts).problems).toEqual(["Debits and credits must be equal."]));
  it("LED-03 · a line with both debit and credit", () => expect(checkDraft([line("rent", "10", "10"), line("accr", "", "0")], "manual", accounts).problems).toContain("Line 1: enter either a debit or a credit, not both."));
  it("LED-04 · negative amounts", () => expect(checkDraft([line("rent", "-10"), line("accr", "", "-10")], "manual", accounts).problems).toContain("Line 1: amounts cannot be negative."));
  it("LED-05 · one line is not enough (blank rows are ignored)", () => expect(checkDraft([line("rent", "10"), line("")], "manual", accounts).problems).toContain("A journal needs at least two lines."));
  it("LED-06 · a fraction of a fils is refused", () => expect(checkDraft([line("rent", "10.005"), line("accr", "", "10.005")], "manual", accounts).problems).toContain("Line 1: amounts must be in AED with at most 2 decimals."));
  it("LED-12 · inactive account", () => expect(checkDraft([line("old", "10"), line("accr", "", "10")], "manual", accounts).problems).toContain("Line 1: account 6150 is inactive."));
  it("control accounts are refused in manual journals but allowed in the opening journal", () => {
    expect(checkDraft([line("bank", "10"), line("accr", "", "10")], "manual", accounts).problems[0]).toMatch(/1010 is a control account/);
    expect(checkDraft([line("bank", "10"), line("accr", "", "10")], "opening", accounts).problems).toEqual([]);
  });
  it("a line needs an account and an amount", () => {
    const p = checkDraft([line("", "10"), line("accr")], "manual", accounts).problems;
    expect(p).toContain("Line 1: choose an account.");
    expect(p).toContain("Line 2: enter an amount.");
  });
});

describe("journalActions — maker-checker in the screens (R1)", () => {
  const admin = ["prepare", "post_journal", "reverse_journal", "lock_period"];
  const accountant = ["prepare", "view"];
  it("preparer of a pending journal can withdraw or edit, never approve", () =>
    expect(journalActions({ status: "pending", source: "manual", prepared_by: "me" }, "me", admin)).toEqual(["edit", "withdraw"]));
  it("another Firm Admin can approve or send back", () =>
    expect(journalActions({ status: "pending", source: "manual", prepared_by: "someone" }, "me", admin)).toEqual(["approve", "send_back", "edit"]));
  it("a Firm Accountant cannot approve (RBAC-04)", () =>
    expect(journalActions({ status: "pending", source: "manual", prepared_by: "someone" }, "me", accountant)).toEqual(["edit"]));
  it("drafts can be edited, submitted or deleted", () =>
    expect(journalActions({ status: "draft", source: "manual", prepared_by: "me" }, "me", accountant)).toEqual(["edit", "submit", "delete"]));
  it("posted: only a Firm Admin may request a reversal, once (D-26)", () => {
    expect(journalActions({ status: "posted", source: "manual", prepared_by: "x" }, "me", admin)).toEqual(["request_reversal"]);
    expect(journalActions({ status: "posted", source: "manual", prepared_by: "x" }, "me", admin, true)).toEqual([]);
    expect(journalActions({ status: "posted", source: "manual", prepared_by: "x" }, "me", accountant)).toEqual([]);
  });
  it("a reversal request: the requester can only cancel; another admin can approve (D-26)", () => {
    expect(journalActions({ status: "pending", source: "reversal", prepared_by: "me" }, "me", admin)).toEqual(["cancel_reversal"]);
    expect(journalActions({ status: "pending", source: "reversal", prepared_by: "x" }, "me", admin)).toEqual(["approve", "cancel_reversal"]);
  });
  it("posted and reversed journals offer nothing else (R2)", () => {
    expect(journalActions({ status: "reversed", source: "manual", prepared_by: "x" }, "me", admin)).toEqual([]);
    expect(journalActions({ status: "posted", source: "reversal", prepared_by: "x" }, "me", admin)).toEqual([]);
  });
});

describe("friendlyDbError", () => {
  it("shows our own rule messages", () => expect(friendlyDbError({ code: "P0001", message: "The period containing 2026-04-20 is locked" })).toBe("The period containing 2026-04-20 is locked"));
  it("explains duplicates and bad amounts", () => {
    expect(friendlyDbError({ code: "23505", message: 'duplicate key value violates unique constraint "accounts_organization_id_code_key"' })).toMatch(/already used/);
    expect(friendlyDbError({ code: "23505", message: 'duplicate key value violates unique constraint "purchase_bills_no_duplicates"' })).toMatch(/ARAP-06/);
    expect(friendlyDbError({ code: "23505", message: "This statement file was already uploaded on 08 Oct 2026 — nothing imported" })).toMatch(/already uploaded/);
    expect(friendlyDbError({ code: "23505", message: 'duplicate key value violates unique constraint "x"' })).toBe("This already exists.");
    expect(friendlyDbError({ code: "22P02", message: "invalid input" })).toMatch(/not valid/);
  });
  it("shows the app's own check messages", () => expect(friendlyDbError(new Error("This file is not a real PDF"))).toBe("This file is not a real PDF"));
  it("hides network failures", () => expect(friendlyDbError(new TypeError("Failed to fetch"))).toBe("Something went wrong. Please try again."));
  it("hides anything unexpected", () => expect(friendlyDbError({ code: "XX000", message: "internal" })).toBe("Something went wrong. Please try again."));
});
