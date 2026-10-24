import { describe, expect, it } from "vitest";
import { androidRequest, seedInvitation, STRONG_PASSWORD, testAdmin, uniqueEmail } from "@/test/fixtures";
import { POST } from "./route";

const URL_BASE = "http://localhost:3000/api/invitations";

interface AcceptJson {
  accessToken?: string;
  user: { email: string; setupComplete: boolean };
  error: { code: string; message: string };
}

async function accept(token: string, body: Record<string, unknown>) {
  const res = await POST(androidRequest(`${URL_BASE}/${token}/accept`, body), {
    params: Promise.resolve({ token }),
  });
  return { status: res.status, json: (await res.json()) as AcceptJson };
}

const base = (email: string) => ({
  email,
  password: STRONG_PASSWORD,
  keepSignedIn: false,
  device: "android",
  privacyNoticeShown: true,
});

describe("POST /api/invitations/{token}/accept (T047, FR-001–FR-007)", () => {
  it("creates the user, returns a session and marks the invitation accepted", async () => {
    const email = uniqueEmail("asha");
    const { id, token } = await seedInvitation(email);
    const { status, json } = await accept(token, base(email));

    expect(status).toBe(201);
    expect(json.accessToken).toBeTruthy();
    expect(json.user.email).toBe(email);
    expect(json.user.setupComplete).toBe(false);

    const { data: inv } = await testAdmin().from("invitations").select("status").eq("id", id).single();
    expect(inv?.status).toBe("accepted");
    const { data: profile } = await testAdmin()
      .from("profiles")
      .select("privacy_notice_shown_at")
      .eq("email", email)
      .single();
    expect(profile?.privacy_notice_shown_at).not.toBeNull();
  });

  it("is idempotent when the same request is retried after success", async () => {
    const email = uniqueEmail("retry");
    const { token } = await seedInvitation(email);
    expect((await accept(token, base(email))).status).toBe(201);
    const again = await accept(token, base(email));
    expect(again.status).toBe(201);
    const { count } = await testAdmin().from("profiles").select("*", { count: "exact", head: true }).eq("email", email);
    expect(count).toBe(1);
  });

  it("refuses an already-accepted invitation used with a different password", async () => {
    const email = uniqueEmail("dup");
    const { token } = await seedInvitation(email);
    await accept(token, base(email));
    const second = await accept(token, { ...base(email), password: "another-strong-pass-91" });
    expect(second.status).toBe(409);
    expect(second.json.error.code).toBe("ALREADY_ACCEPTED");
  });

  it("refuses expired and revoked invitations", async () => {
    const expired = await seedInvitation(uniqueEmail("exp"), { expired: true });
    const revoked = await seedInvitation(uniqueEmail("rev"), { status: "revoked" });
    expect((await accept(expired.token, base("x@example.com"))).json.error.code).toBe("INVITE_EXPIRED");
    expect((await accept(revoked.token, base("x@example.com"))).json.error.code).toBe("INVITE_REVOKED");
  });

  it("refuses an email that does not match the invitation", async () => {
    const { token } = await seedInvitation(uniqueEmail("match"));
    const { status, json } = await accept(token, base(uniqueEmail("other")));
    expect(status).toBe(422);
    expect(json.error.code).toBe("EMAIL_MISMATCH");
  });

  it("matches the email case-insensitively", async () => {
    const email = uniqueEmail("case");
    const { token } = await seedInvitation(email);
    expect((await accept(token, base(email.toUpperCase()))).status).toBe(201);
  });

  it("rejects weak passwords (FR-007)", async () => {
    const email = uniqueEmail("weak");
    const { token } = await seedInvitation(email);
    const common = await accept(token, { ...base(email), password: "password1" });
    expect(common.status).toBe(422);
    expect(common.json.error.code).toBe("WEAK_PASSWORD");
    const short = await accept(token, { ...base(email), password: "abc" });
    expect(short.json.error.code).toBe("WEAK_PASSWORD");
  });

  it("requires the privacy notice to have been shown (FR-036e)", async () => {
    const email = uniqueEmail("notice");
    const { token } = await seedInvitation(email);
    const { status } = await accept(token, { ...base(email), privacyNoticeShown: false });
    expect(status).toBe(400);
  });

  it("returns 404 for unknown or superseded tokens", async () => {
    const superseded = await seedInvitation(uniqueEmail("sup"), { status: "superseded" });
    expect((await accept(superseded.token, base("x@example.com"))).json.error.code).toBe("INVITE_NOT_FOUND");
    expect((await accept("A".repeat(43), base("x@example.com"))).json.error.code).toBe("INVITE_NOT_FOUND");
  });
});
