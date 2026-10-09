import { describe, expect, it } from "vitest";
import { addDays, invitableRoles, readOnlyEndProblem } from "./clientUsers";

describe("client logins (P3-06)", () => {
  it("RBAC-15/16 · who can be invited by whom", () => {
    expect(invitableRoles(true)).toEqual(["client_owner", "client_staff", "read_only"]);
    expect(invitableRoles(false)).toEqual(["client_staff", "read_only"]);
  });
  it("D-49 · read-only defaults 90 days ahead, at most a year", () => {
    expect(addDays("2026-10-08", 90)).toBe("2027-01-06");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(readOnlyEndProblem("2027-01-06", "2026-10-08", 365)).toBeNull();
    expect(readOnlyEndProblem("2027-10-09", "2026-10-08", 365)).toMatch(/at most 365 days/);
    expect(readOnlyEndProblem("2026-10-07", "2026-10-08", 365)).toMatch(/past/);
    expect(readOnlyEndProblem("", "2026-10-08", 365)).toMatch(/Choose/);
  });
});
