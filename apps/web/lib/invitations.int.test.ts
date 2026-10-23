import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { testAdmin, uniqueEmail } from "@/test/fixtures";

/**
 * T122 / SC-008: `invitation_delivery_failed` is recorded when the invitation email cannot be sent
 * (FR-003b, FR-037). The mail server here points at a closed port so every send fails.
 */
const saved = { host: process.env.SMTP_HOST, port: process.env.SMTP_PORT };
beforeAll(() => {
  process.env.SMTP_HOST = "127.0.0.1";
  process.env.SMTP_PORT = "9"; // discard port: nothing listens, the connection is refused
});
afterAll(() => {
  process.env.SMTP_HOST = saved.host;
  process.env.SMTP_PORT = saved.port;
});

describe("invitation email delivery failure (FR-003b)", () => {
  it("keeps the invitation, marks it failed and audits invitation_delivery_failed", async () => {
    const { createInvitation } = await import("./invitations");
    const db = testAdmin();
    const { data: owner } = await db.from("profiles").select("user_id, email").eq("role", "owner").maybeSingle();
    const actor = owner
      ? { id: owner.user_id as string, email: owner.email as string }
      : { id: "00000000-0000-4000-8000-0000000000aa", email: "owner@example.com" };

    const email = uniqueEmail("undeliverable");
    const created = await createInvitation(email, actor);
    expect(created.deliveryStatus).toBe("failed");

    const { data: inv } = await db.from("invitations").select("status, delivery_status").eq("id", created.id).single();
    expect(inv).toEqual({ status: "pending", delivery_status: "failed" });

    const { data: events } = await db
      .from("audit_events")
      .select("action, target_ref, details")
      .eq("target_id", created.id);
    expect(events?.map((e) => e.action)).toEqual(["invitation_delivery_failed"]);
    expect(events?.[0]?.target_ref).toBe(email);
  });
});
