import { describe, expect, it } from "vitest";
import { contactProblems, emptyContact, trnStatus } from "./contacts";

const base = { ...emptyContact("customer"), name: "Gulf Buyer LLC" };

describe("contactProblems", () => {
  it("a minimal customer is fine", () => expect(contactProblems(base)).toEqual([]));
  it("a name is required", () => expect(contactProblems({ ...base, name: "  " })).toContain("Enter the name."));
  it("ARAP-07 / F-18 · TRN must be 15 digits starting with 1", () => {
    expect(contactProblems({ ...base, trn: "100211938400003" })).toEqual([]);
    for (const bad of ["12345", "200211938400003", "10021193840000X"]) expect(contactProblems({ ...base, trn: bad })).toContain("A TRN is 15 digits starting with 1.");
  });
  it("only UAE contacts have an emirate", () => expect(contactProblems({ ...base, countryCode: "GB", emirateCode: "DXB" })).toContain("Only UAE contacts have an emirate."));
  it("country codes are two letters", () => expect(contactProblems({ ...base, countryCode: "UAE" })).toContain("Country must be a 2-letter code, e.g. AE, SA, GB."));
  it("email and payment terms are checked", () => {
    expect(contactProblems({ ...base, email: "nope" })).toContain("That email address does not look right.");
    expect(contactProblems({ ...base, paymentTermsDays: "400" })).toContain("Payment terms must be 0–365 days.");
    expect(contactProblems({ ...base, paymentTermsDays: "45" })).toEqual([]);
  });
});

describe("trnStatus", () => {
  it("UAE with TRN, UAE without, foreign", () => {
    expect(trnStatus({ trn: "100211938400003", country_code: "AE" })).toBe("valid");
    expect(trnStatus({ trn: null, country_code: "AE" })).toBe("missing");
    expect(trnStatus({ trn: null, country_code: "GB" })).toBe("foreign");
  });
});
