import { describe, expect, it } from "vitest";
import { parseRoute, routeHash } from "./routes";

const id = "0f8e7d6c-5b4a-4321-9876-0123456789ab";

describe("live app page addresses", () => {
  it("defaults to the client list", () => {
    expect(parseRoute("")).toEqual({ page: "clients" });
    expect(parseRoute("#")).toEqual({ page: "clients" });
    expect(parseRoute("#vat")).toEqual({ page: "clients" }); // old demo anchors fall back safely
  });
  it("reads a client page and tab", () => {
    expect(parseRoute(`#/clients/${id}`)).toEqual({ page: "client", clientId: id, tab: "overview" });
    expect(parseRoute(`#/clients/${id}/accounts`)).toEqual({ page: "client", clientId: id, tab: "accounts" });
    expect(parseRoute(`#/clients/${id}/nonsense`)).toEqual({ page: "client", clientId: id, tab: "overview" });
  });
  it("ignores a client id that isn't an id", () => expect(parseRoute("#/clients/not-an-id")).toEqual({ page: "clients" }));
  it("reads the team page", () => expect(parseRoute("#/team")).toEqual({ page: "team" }));
  it("reads admin tabs, defaulting to My profile", () => {
    expect(parseRoute("#/admin/tax")).toEqual({ page: "admin", tab: "tax" });
    expect(parseRoute("#/admin")).toEqual({ page: "admin", tab: "profile" });
    expect(parseRoute("#/admin/nope")).toEqual({ page: "admin", tab: "profile" });
  });
  it("round-trips", () => {
    for (const r of [{ page: "clients" }, { page: "team" }, { page: "client", clientId: id, tab: "periods" }, { page: "client", clientId: id, tab: "overview" }, { page: "admin", tab: "email" }] as const)
      expect(parseRoute(routeHash(r))).toEqual(r);
  });
});
