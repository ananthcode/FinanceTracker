import { describe, expect, it } from "vitest";
import { testAdmin } from "@/test/fixtures";
import { bearerRequest, newMember } from "@/test/sync";
import { POST } from "./route";

/** R1 T113 — app lock on/off is recorded in the user's history (FR-037), with no PIN details. */
const URL = "http://localhost:3000/api/me/audit";

describe("POST /api/me/audit", () => {
  it("records app_lock_enabled and app_lock_disabled for the caller from Android", async () => {
    const m = await newMember("applock");
    for (const action of ["app_lock_enabled", "app_lock_disabled"]) {
      const res = await POST(bearerRequest(URL, m.token, "POST", { action, device: "android" }));
      expect(res.status).toBe(204);
    }
    const { data } = await testAdmin()
      .from("audit_events")
      .select("action, device_type, details")
      .eq("actor_id", m.id)
      .in("action", ["app_lock_enabled", "app_lock_disabled"])
      .order("id");
    expect(data?.map((e) => e.action)).toEqual(["app_lock_enabled", "app_lock_disabled"]);
    expect(data?.every((e) => e.device_type === "android")).toBe(true);
  });

  it("refuses other actions and extra fields (no PIN can be sent)", async () => {
    const m = await newMember("applockbad");
    for (const body of [
      { action: "user_erased", device: "android" },
      { action: "app_lock_enabled", device: "web" },
      { action: "app_lock_enabled", device: "android", pin: "1234" },
    ]) {
      expect((await POST(bearerRequest(URL, m.token, "POST", body))).status).toBe(400);
    }
  });
});
