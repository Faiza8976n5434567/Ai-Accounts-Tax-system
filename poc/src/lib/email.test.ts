import { describe, expect, it } from "vitest";
import { renderTemplate, roleLabel, shortDate, textToHtml } from "./email";

describe("renderTemplate", () => {
  it("fills placeholders, with or without spaces", () => {
    expect(renderTemplate("Hello {{name}}, welcome to {{ app_name }}", { name: "Aisha", app_name: "TFS+ Smart Ledger" }))
      .toBe("Hello Aisha, welcome to TFS+ Smart Ledger");
  });
  it("leaves unknown placeholders visible", () => expect(renderTemplate("Hi {{nobody}}", {})).toBe("Hi {{nobody}}"));
  it("fills the same placeholder twice", () => expect(renderTemplate("{{a}}-{{a}}", { a: "x" })).toBe("x-x"));
});

describe("textToHtml", () => {
  it("escapes HTML so names can't inject markup", () => expect(textToHtml("<b>Ali & Co</b>")).toBe("&lt;b&gt;Ali &amp; Co&lt;/b&gt;"));
  it("turns links into clickable links and keeps line breaks", () =>
    expect(textToHtml("Open:\nhttps://example.com/x?y=1")).toBe('Open:<br><a href="https://example.com/x?y=1">https://example.com/x?y=1</a>'));
});

describe("labels", () => {
  it("role names in plain words", () => {
    expect(roleLabel("firm_accountant")).toBe("Firm Accountant");
    expect(roleLabel("something_new")).toBe("something_new");
  });
  it("dates in UAE time, day-month-year", () => expect(shortDate("2026-10-13T21:30:00Z")).toBe("14 Oct 2026"));
});
