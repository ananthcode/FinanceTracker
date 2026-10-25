import { randomUUID } from "node:crypto";
import { formatHlc, nextHlc, type ChangeInput, type HlcParts } from "@ft/core";
import { POST as accept } from "@/app/api/invitations/[token]/accept/route";
import { seedInvitation, STRONG_PASSWORD, testAdmin, uniqueEmail } from "./fixtures";

/** Integration-test helpers for the sync API (R2). Synthetic users and data only. */

export interface TestMember {
  id: string;
  email: string;
  token: string;
}

/** An invited, accepted member with an Android bearer token. */
export async function newMember(prefix = "sync"): Promise<TestMember> {
  const email = uniqueEmail(prefix);
  const inv = await seedInvitation(email);
  const res = await accept(
    new Request(`http://localhost:3000/api/invitations/${inv.token}/accept`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-ft-client": "android" },
      body: JSON.stringify({ email, password: STRONG_PASSWORD, keepSignedIn: true, device: "android", privacyNoticeShown: true }),
    }),
    { params: Promise.resolve({ token: inv.token }) },
  );
  if (res.status !== 201) throw new Error(`newMember failed: ${res.status}`);
  const body = (await res.json()) as { accessToken: string };
  const { data } = await testAdmin().from("profiles").select("user_id").eq("email", email).single();
  return { id: data!.user_id as string, email, token: body.accessToken };
}

export function bearerRequest(url: string, token: string, method = "GET", body?: unknown, headers: Record<string, string> = {}): Request {
  return new Request(url, {
    method,
    headers: { authorization: `Bearer ${token}`, "x-ft-client": "android", "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/** A simulated device: its own id and hybrid logical clock (contracts/sync-protocol.md §HLC). */
export class FakeDevice {
  private clock: HlcParts | null = null;
  readonly id = `dev${randomUUID().replace(/-/g, "").slice(0, 12)}`;

  /** Next HLC at `now` (defaults to the real clock). */
  hlc(now = Date.now()): string {
    this.clock = nextHlc(this.clock, now, this.id);
    return formatHlc(this.clock);
  }

  change(entity: ChangeInput["entity"], entityId: string, kind: ChangeInput["kind"], fields?: Record<string, unknown>, extra: Partial<ChangeInput> = {}): ChangeInput {
    return { changeId: randomUUID(), entity, entityId, kind, ...(fields ? { fields } : {}), hlc: this.hlc(), ...extra };
  }
}

export function accountFields(name: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name,
    type: "bank",
    openingBalanceMinor: "0",
    openingBalanceDate: "2026-04-01",
    colour: "blue",
    icon: "bank",
    sortKey: "a0",
    ...extra,
  };
}
