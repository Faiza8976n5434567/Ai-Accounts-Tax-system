import { describe, expect, it } from "vitest";
import { einvState, sha256Hex, type Submission } from "./einvoicing";

const sub = (attempt: number, status: Submission["status"]) => ({ attempt, status }) as Submission;
const ready = { status: "ready" as const, problems: [] }, missing = { status: "missing" as const, problems: ["x"] };

describe("e-invoice status of a document (D-63)", () => {
  it("follows the latest hand-off", () => {
    expect(einvState(ready, [])).toBe("to_send");
    expect(einvState(ready, [sub(1, "sent")])).toBe("sent");
    expect(einvState(ready, [sub(1, "rejected")])).toBe("rejected");
    expect(einvState(ready, [sub(1, "rejected"), sub(2, "accepted")])).toBe("accepted");
  });
  it("a rejected document with missing data needs fixing first; consumers are out of scope", () => {
    expect(einvState(missing, [sub(1, "rejected")])).toBe("needs_fixing");
    expect(einvState({ status: "not_in_scope", problems: [] }, [])).toBe("not_in_scope");
  });
  it("fingerprints the file (SHA-256)", async () => {
    expect(await sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});
