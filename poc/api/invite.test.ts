import { describe, expect, it } from "vitest";
import { handleInvite, type InviteDeps, type InviteInput, type InvitationRow } from "./invite";

const row: InvitationRow = {
  invitation_id: "11111111-1111-1111-1111-111111111111", email: "aisha@example.com", full_name: "Aisha Khan",
  role: "firm_accountant", expires_at: "2026-10-14T08:00:00Z", firm_name: "TFS Plus Tax & Accountancy LLC", inviter_name: "Faizan",
};
const deps = (over: Partial<InviteDeps> = {}): InviteDeps => ({
  createInvitation: async () => ({ row }),
  generateLink: async () => ({ link: "https://example.supabase.co/auth/v1/verify?token=t&type=invite" }),
  sendInviteEmail: async () => ({ sent: true }),
  ...over,
});
const req = (body: unknown, token: string | null = "user-jwt", method = "POST") =>
  new Request("http://localhost/api/invite", {
    method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: method === "POST" ? JSON.stringify(body) : undefined,
  });
const good = { email: "aisha@example.com", fullName: "Aisha Khan", role: "firm_accountant" };

describe("POST /api/invite — SEC-15", () => {
  it("401 without a session", async () => {
    const res = await handleInvite(req(good, null), deps());
    expect(res.status).toBe(401);
  });
  it("401 when the session token is no longer valid", async () => {
    const res = await handleInvite(req(good), deps({ createInvitation: async () => ({ error: { code: "PGRST301", message: "JWT expired" } }) }));
    expect(res.status).toBe(401);
  });
  it("403 when the database says the caller may not invite (e.g. Client Staff, Firm Accountant)", async () => {
    let linkCreated = false;
    const res = await handleInvite(req(good), deps({
      createInvitation: async () => ({ error: { code: "42501", message: "Only a Firm Admin can invite people" } }),
      generateLink: async () => { linkCreated = true; return { link: "x" }; },
    }));
    expect(res.status).toBe(403);
    expect(linkCreated).toBe(false); // the secret-key step never runs for a refused caller
    expect(await res.json()).toEqual({ error: "Only a Firm Admin can invite people" });
  });
  it("405 for anything but POST", async () => expect((await handleInvite(req(null, "t", "GET"), deps())).status).toBe(405));
});

describe("POST /api/invite — validation and errors", () => {
  it("400 when fields are missing", async () => {
    const res = await handleInvite(req({ email: "a@b.co" }), deps());
    expect(res.status).toBe(400);
  });
  it("400 for a body that isn't JSON", async () => {
    const r = new Request("http://localhost/api/invite", { method: "POST", headers: { authorization: "Bearer t" }, body: "not json" });
    expect((await handleInvite(r, deps())).status).toBe(400);
  });
  it("passes the database's plain-language rule messages through", async () => {
    const res = await handleInvite(req(good), deps({ createInvitation: async () => ({ error: { code: "23514", message: "Firm staff must use a firm email address (@tfsplus.ae)" } }) }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/firm email address/);
  });
  it("never shows unexpected database errors to the user (S-2.8)", async () => {
    const res = await handleInvite(req(good), deps({ createInvitation: async () => ({ error: { code: "XX000", message: "internal: relation x does not exist" } }) }));
    expect(res.status).toBe(500);
    expect((await res.json()).error).not.toMatch(/relation/);
  });
  it("500 with guidance when the link can't be created", async () => {
    const res = await handleInvite(req(good), deps({ generateLink: async () => ({ error: "boom" }) }));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toMatch(/Revoke it and try again/);
  });
});

describe("POST /api/invite — success (D-24)", () => {
  it("returns the link for 'Copy invite link' and reports the email result", async () => {
    const res = await handleInvite(req(good), deps());
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({
      invitationId: row.invitation_id, link: "https://example.supabase.co/auth/v1/verify?token=t&type=invite",
      expiresAt: row.expires_at, emailSent: true, emailNote: null,
    });
  });
  it("still succeeds when the email can't be delivered — the admin copies the link", async () => {
    const res = await handleInvite(req(good), deps({ sendInviteEmail: async () => ({ sent: false, note: "copy the link" }) }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.emailSent).toBe(false);
    expect(body.emailNote).toBe("copy the link");
  });
});

describe("POST /api/invite — client logins (P3-06)", () => {
  const org = "8f300340-5b2f-4a08-86d5-b8198a9e517b";
  it("passes the client and the read-only end date to the database", async () => {
    let seen: InviteInput | null = null;
    const res = await handleInvite(req({ ...good, role: "read_only", organizationId: org, validTo: "2027-01-06" }),
      deps({ createInvitation: async (_t, input) => { seen = input; return { row: { ...row, role: "read_only" } }; } }));
    expect(res.status).toBe(200);
    expect(seen).toEqual({ email: good.email, fullName: good.fullName, role: "read_only", organizationId: org, validTo: "2027-01-06" });
  });
  it("firm staff invitations carry no client", async () => {
    let seen: InviteInput | null = null;
    await handleInvite(req(good), deps({ createInvitation: async (_t, input) => { seen = input; return { row }; } }));
    expect(seen).toEqual(good);
  });
  it("rejects a malformed client id or end date", async () => {
    expect((await handleInvite(req({ ...good, organizationId: "x'; drop" }), deps())).status).toBe(400);
    expect((await handleInvite(req({ ...good, organizationId: org, validTo: "next week" }), deps())).status).toBe(400);
  });
  it("RBAC-15 · the database's refusal is shown as 403", async () => {
    const res = await handleInvite(req({ ...good, organizationId: org }), deps({ createInvitation: async () => ({ error: { code: "42501", message: "Only a Firm Admin can invite a Client Owner" } }) }));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Only a Firm Admin can invite a Client Owner" });
  });
});
