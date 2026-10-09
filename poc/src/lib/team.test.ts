import { describe, expect, it } from "vitest";
import { inviteDisplayStatus } from "./team";

describe("inviteDisplayStatus", () => {
  const now = Date.UTC(2026, 9, 7, 12, 0, 0);
  it("a pending invitation past its expiry shows as expired (CFG-10)", () => expect(inviteDisplayStatus("pending", "2026-10-07T11:59:59Z", now)).toBe("expired"));
  it("a pending invitation before expiry stays pending", () => expect(inviteDisplayStatus("pending", "2026-10-14T12:00:00Z", now)).toBe("pending"));
  it("accepted and revoked are shown as they are", () => {
    expect(inviteDisplayStatus("accepted", "2026-10-01T00:00:00Z", now)).toBe("accepted");
    expect(inviteDisplayStatus("revoked", "2026-10-14T00:00:00Z", now)).toBe("revoked");
  });
});
