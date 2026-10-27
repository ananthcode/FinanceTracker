import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { testAdmin } from "@/test/fixtures";
import { accountFields, bearerRequest, FakeDevice, newMember } from "@/test/sync";
import { POST as push } from "./route";

/** T032 — POST /api/sync/push (contracts/http-api.md; FR-026, FR-031). */
const URL_PUSH = "http://localhost:3000/api/sync/push";

interface PushJson {
  results: { changeId: string; status: string; code?: string; appliedFields: string[] }[];
  error?: { code: string };
}
const json = async (res: Response) => (await res.json()) as PushJson;

describe("POST /api/sync/push", () => {
  it("applies an Android push and returns one result per change", async () => {
    const m = await newMember();
    const device = new FakeDevice();
    const id = randomUUID();
    const res = await push(bearerRequest(URL_PUSH, m.token, "POST", {
      device: "android",
      changes: [device.change("account", id, "create", accountFields("Petrol cash", { type: "cash", icon: "fuel" }))],
    }));
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.results).toHaveLength(1);
    expect(body.results[0]!.status).toBe("applied");
    const { data } = await testAdmin().from("accounts").select("name, user_id").eq("id", id).single();
    expect(data).toEqual({ name: "Petrol cash", user_id: m.id });
  });

  it("refuses a cross-site browser request (CSRF origin check)", async () => {
    const m = await newMember();
    const res = await push(bearerRequest(URL_PUSH, m.token, "POST",
      { device: "android", changes: [new FakeDevice().change("account", randomUUID(), "archive")] },
      { origin: "https://evil.example" }));
    expect(res.status).toBe(403);
  });

  it("refuses a device that does not match how the request signed in", async () => {
    const m = await newMember();
    const res = await push(bearerRequest(URL_PUSH, m.token, "POST",
      { device: "web", changes: [new FakeDevice().change("account", randomUUID(), "archive")] }));
    expect(res.status).toBe(400);
    expect((await json(res)).error?.code).toBe("VALIDATION_FAILED");
  });

  it("refuses the whole batch when any change fails the shape check — nothing is applied", async () => {
    const m = await newMember();
    const device = new FakeDevice();
    const good = randomUUID();
    const res = await push(bearerRequest(URL_PUSH, m.token, "POST", {
      device: "android",
      changes: [
        device.change("account", good, "create", accountFields("Good one")),
        device.change("account", randomUUID(), "create", accountFields("Float money", { openingBalanceMinor: 1.5 })),
      ],
    }));
    expect(res.status).toBe(400);
    const { count } = await testAdmin().from("accounts").select("id", { count: "exact", head: true }).eq("id", good);
    expect(count).toBe(0);
  });

  it("rejects only the change a database-side check refuses; the rest apply", async () => {
    const m = await newMember();
    const other = await newMember("other");
    const theirGroup = randomUUID();
    const otherDevice = new FakeDevice();
    await push(bearerRequest(URL_PUSH, other.token, "POST", {
      device: "android",
      changes: [otherDevice.change("account_group", theirGroup, "create", { name: "Theirs", sortKey: "a0" })],
    }));

    const device = new FakeDevice();
    const res = await push(bearerRequest(URL_PUSH, m.token, "POST", {
      device: "android",
      changes: [
        device.change("account", randomUUID(), "create", accountFields("Mine", { groupId: theirGroup })),
        device.change("account", randomUUID(), "create", accountFields("Also mine")),
      ],
    }));
    expect(res.status).toBe(200);
    expect((await json(res)).results.map((r) => [r.status, r.code])).toEqual([
      ["rejected", "VALIDATION_FAILED"],
      ["applied", undefined],
    ]);
  });

  it("returns duplicate for a replayed change and applies it once", async () => {
    const m = await newMember();
    const change = new FakeDevice().change("account", randomUUID(), "create", accountFields("Once"));
    await push(bearerRequest(URL_PUSH, m.token, "POST", { device: "android", changes: [change] }));
    const again = await json(await push(bearerRequest(URL_PUSH, m.token, "POST", { device: "android", changes: [change] })));
    expect(again.results[0]!.status).toBe("duplicate");
    const { count } = await testAdmin().from("accounts").select("id", { count: "exact", head: true }).eq("user_id", m.id);
    expect(count).toBe(1);
  });

  it("signs out a disabled user: 401 USER_INACTIVE and nothing applied", async () => {
    const m = await newMember();
    await testAdmin().from("profiles").update({ status: "disabled" }).eq("user_id", m.id);
    const id = randomUUID();
    const res = await push(bearerRequest(URL_PUSH, m.token, "POST", {
      device: "android",
      changes: [new FakeDevice().change("account", id, "create", accountFields("Too late"))],
    }));
    expect(res.status).toBe(401);
    expect((await json(res)).error?.code).toBe("USER_INACTIVE");
    const { count } = await testAdmin().from("accounts").select("id", { count: "exact", head: true }).eq("id", id);
    expect(count).toBe(0);
  });
});
