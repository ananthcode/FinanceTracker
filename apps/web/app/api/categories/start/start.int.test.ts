import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_CATEGORY_COUNT } from "@ft/core";
import { testAdmin } from "@/test/fixtures";
import { bearerRequest, newMember } from "@/test/sync";
import { GET as getMe } from "../../me/route";
import { PATCH as patchPreferences } from "../../me/preferences/route";
import { POST as start } from "./route";

/** R3 T024 — POST /api/categories/start (FR-007, research R3-06; SC-008). */
const URL = "http://localhost:3000/api/categories/start";
const startAs = (token: string, choice: unknown) => start(bearerRequest(URL, token, "POST", { choice }));
const countCategories = async (userId: string) =>
  (await testAdmin().from("categories").select("id", { count: "exact", head: true }).eq("user_id", userId)).count;

afterEach(() => vi.restoreAllMocks());

describe("POST /api/categories/start", () => {
  it("adds the suggested categories once and records the choice", async () => {
    const m = await newMember("start");
    const before = (await (await getMe(bearerRequest("http://localhost:3000/api/me", m.token))).json()) as {
      preferences: { categoriesStart: string | null };
    };
    expect(before.preferences.categoriesStart).toBeNull();

    const res = await startAs(m.token, "suggested");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ choice: "suggested", added: DEFAULT_CATEGORY_COUNT });
    expect(await countCategories(m.id)).toBe(74);

    const after = (await (await getMe(bearerRequest("http://localhost:3000/api/me", m.token))).json()) as {
      preferences: { categoriesStart: string | null };
    };
    expect(after.preferences.categoriesStart).toBe("suggested");
  });

  it("never adds the defaults twice, even for two requests at the same moment", async () => {
    const m = await newMember("startrace");
    const results = await Promise.all([startAs(m.token, "suggested"), startAs(m.token, "suggested")]);
    const bodies = (await Promise.all(results.map((r) => r.json()))) as { added: number }[];
    expect(bodies.map((b) => b.added).sort((a, b) => a - b)).toEqual([0, DEFAULT_CATEGORY_COUNT]);
    expect(await countCategories(m.id)).toBe(DEFAULT_CATEGORY_COUNT);
  });

  it("keeps the first answer; 'add suggested' still works while the user has no categories", async () => {
    const m = await newMember("startempty");
    expect(await (await startAs(m.token, "empty")).json()).toEqual({ choice: "empty", added: 0 });
    expect(await (await startAs(m.token, "suggested")).json()).toEqual({ choice: "empty", added: DEFAULT_CATEGORY_COUNT });
    expect(await (await startAs(m.token, "suggested")).json()).toEqual({ choice: "empty", added: 0 });
  });

  it("cannot be set through the preferences endpoint", async () => {
    const m = await newMember("startpatch");
    const res = await patchPreferences(
      bearerRequest("http://localhost:3000/api/me/preferences", m.token, "PATCH", { categoriesStart: "empty" }),
    );
    expect(res.status).toBe(400);
  });

  it("refuses unknown choices and signed-out callers, and logs no category names (FR-029)", async () => {
    const m = await newMember("startbad");
    const spies = (["log", "info", "warn", "error"] as const).map((k) => vi.spyOn(console, k).mockImplementation(() => {}));
    expect((await startAs(m.token, "everything")).status).toBe(400);
    const signedOut = new Request(URL, {
      method: "POST",
      headers: { origin: "http://localhost:3000", "content-type": "application/json" },
      body: JSON.stringify({ choice: "empty" }),
    });
    expect((await start(signedOut)).status).toBe(401);
    await startAs(m.token, "suggested");
    const logged = spies.flatMap((s) => s.mock.calls.flat().map((x) => (typeof x === "string" ? x : JSON.stringify(x))));
    expect(logged.join(" ")).not.toMatch(/Groceries|Salary|Electricity/);
  });

  it("rate-limits to 10 requests a minute", async () => {
    const m = await newMember("startrate");
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) statuses.push((await startAs(m.token, "empty")).status);
    expect(statuses.slice(0, 10).every((s) => s === 200)).toBe(true);
    expect(statuses[10]).toBe(429);
  });
});
