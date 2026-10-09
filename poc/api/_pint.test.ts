import { readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { officialExample, parseSvrl, validatePint, type PintKind } from "./_pint";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "einvoicing", "pint-ae-1.0.4");
const examples = (kind: PintKind) => readdirSync(join(ROOT, `trn-${kind}`, "example")).filter((f) => f.endsWith(".xml"));

describe("PINT AE 1.0.4 validator (official UAE Peppol Authority rules)", () => {
  it.each(examples("invoice"))("official invoice example passes: %s", (f) => {
    const r = validatePint(officialExample("invoice", f), "invoice");
    expect(r.fatal.map((x) => `${x.id}: ${x.text}`)).toEqual([]);
  }, 120_000);
  it.each(examples("creditnote"))("official credit note example passes: %s", (f) => {
    const r = validatePint(officialExample("creditnote", f), "creditnote");
    expect(r.fatal.map((x) => `${x.id}: ${x.text}`)).toEqual([]);
  }, 120_000);
  it("catches a broken invoice: buyer address without city (IBR-144-AE)", () => {
    const xml = officialExample("invoice", "Standard invoice Mandatory fields.xml").replace("<cbc:CityName>CityName</cbc:CityName>", "");
    const r = validatePint(xml, "invoice");
    expect(r.valid).toBe(false);
    expect(r.fatal.map((x) => x.id)).toContain("IBR-144-AE");
  }, 120_000);
  it("reads an SVRL report", () => {
    expect(parseSvrl(`<svrl:failed-assert id="IBR-001" flag="fatal" location="/Invoice"><svrl:text>[IBR-001]-An Invoice shall have a &lt;number&gt;</svrl:text></svrl:failed-assert>`))
      .toEqual([{ id: "IBR-001", flag: "fatal", text: "[IBR-001]-An Invoice shall have a <number>", location: "/Invoice" }]);
  });
});
