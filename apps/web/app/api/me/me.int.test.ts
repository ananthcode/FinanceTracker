import { describe, expect, it } from "vitest";
import { POST as accept } from "@/app/api/invitations/[token]/accept/route";
import { seedInvitation, STRONG_PASSWORD, testAdmin, uniqueEmail } from "@/test/fixtures";
import { GET as getMe } from "./route";
import { PATCH as patchPreferences } from "./preferences/route";
import { POST as postSetup } from "./setup/route";

const BASE = "http://localhost:3000/api/me";

/** Creates an invited member through the real accept endpoint and returns an Android bearer token. */
async function newMember(): Promise<{ token: string; email: string }> {
  const email = uniqueEmail("me");
  const inv = await seedInvitation(email);
  const res = await accept(
    new Request(`http://localhost:3000/api/invitations/${inv.token}/accept`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-ft-client": "android" },
      body: JSON.stringify({ email, password: STRONG_PASSWORD, keepSignedIn: true, device: "android", privacyNoticeShown: true }),
    }),
    { params: Promise.resolve({ token: inv.token }) },
  );
  const body = (await res.json()) as { accessToken: string };
  return { token: body.accessToken, email };
}

function req(url: string, token: string, method = "GET", body?: unknown): Request {
  return new Request(url, {
    method,
    headers: { authorization: `Bearer ${token}`, "x-ft-client": "android", "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const SETUP = {
  displayName: "  Asha Test  ",
  baseCurrency: "INR",
  numberFormat: "indian",
  dateFormat: "dd-MMM-yyyy",
  fyStartMonth: 4,
  timezone: "Asia/Kolkata",
};

interface Json {
  setupComplete: boolean;
  displayName: string | null;
  role: string;
  environment: string;
  preferences: Record<string, unknown>;
  error: { code: string };
}
const json = async (res: Response) => (await res.json()) as Json;

describe("GET /api/me, POST /api/me/setup, PATCH /api/me/preferences (T081, US3)", () => {
  it("returns India-first defaults before setup", async () => {
    const { token } = await newMember();
    const res = await getMe(req(BASE, token));
    expect(res.status).toBe(200);
    const me = await json(res);
    expect(me.setupComplete).toBe(false);
    expect(me.role).toBe("member");
    expect(me.environment).toBe("demo");
    expect(me.preferences).toEqual({
      baseCurrency: "INR",
      numberFormat: "indian",
      dateFormat: "dd-MMM-yyyy",
      fyStartMonth: 4,
      timezone: "Asia/Kolkata",
      accountsView: "by_type", // R2 FR-009
      categoriesStart: null, // R3 FR-007
    });
  });

  it("completes setup once, trimming the display name, then refuses a second time", async () => {
    const { token } = await newMember();
    const first = await postSetup(req(`${BASE}/setup`, token, "POST", SETUP));
    expect(first.status).toBe(200);
    const me = await json(first);
    expect(me.setupComplete).toBe(true);
    expect(me.displayName).toBe("Asha Test");

    const again = await postSetup(req(`${BASE}/setup`, token, "POST", SETUP));
    expect(again.status).toBe(409);
    expect((await json(again)).error.code).toBe("SETUP_ALREADY_COMPLETE");
  });

  it("requires the privacy notice when it was never recorded (Google path, FR-036e)", async () => {
    const { token, email } = await newMember();
    await testAdmin().from("profiles").update({ privacy_notice_shown_at: null }).eq("email", email);
    const res = await postSetup(req(`${BASE}/setup`, token, "POST", SETUP));
    expect(res.status).toBe(422);
    expect((await json(res)).error.code).toBe("PRIVACY_NOTICE_REQUIRED");
    const ok = await postSetup(req(`${BASE}/setup`, token, "POST", { ...SETUP, privacyNoticeShown: true }));
    expect(ok.status).toBe(200);
  });

  it("rejects invalid setup values", async () => {
    const { token } = await newMember();
    expect((await postSetup(req(`${BASE}/setup`, token, "POST", { ...SETUP, displayName: "   " }))).status).toBe(400);
    expect((await postSetup(req(`${BASE}/setup`, token, "POST", { ...SETUP, timezone: "Mars/Olympus" }))).status).toBe(400);
    expect((await postSetup(req(`${BASE}/setup`, token, "POST", { ...SETUP, displayName: "x".repeat(51) }))).status).toBe(400);
  });

  it("updates preferences, but never the base currency (FR-021)", async () => {
    const { token } = await newMember();
    await postSetup(req(`${BASE}/setup`, token, "POST", SETUP));

    const res = await patchPreferences(req(`${BASE}/preferences`, token, "PATCH", { numberFormat: "international", fyStartMonth: 1 }));
    expect(res.status).toBe(200);
    const me = await json(res);
    expect(me.preferences.numberFormat).toBe("international");
    expect(me.preferences.fyStartMonth).toBe(1);

    const locked = await patchPreferences(req(`${BASE}/preferences`, token, "PATCH", { baseCurrency: "USD" }));
    expect(locked.status).toBe(422);
    expect((await json(locked)).error.code).toBe("BASE_CURRENCY_LOCKED");
  });

  it("requires sign-in", async () => {
    const res = await getMe(new Request(BASE, { headers: { "x-ft-client": "android" } }));
    expect(res.status).toBe(401);
  });
});
