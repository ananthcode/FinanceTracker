import { describe, expect, it } from "vitest";
import { bearerRequest, newMember } from "@/test/sync";
import { POST } from "./route";

/** R4 T040 — POST /api/interest/propose (contracts/http-api.md). Amounts are covered by the parity vectors. */
const URL = "http://localhost:3000/api/interest/propose";

describe("POST /api/interest/propose", () => {
  it("proposes for the signed-in user and reports how many changed", async () => {
    const m = await newMember("intpropose");
    const res = await POST(bearerRequest(URL, m.token, "POST", {}));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ changed: 0 });
  });

  it("refuses a caller who is not signed in", async () => {
    const res = await POST(bearerRequest(URL, "not-a-token", "POST", {}));
    expect(res.status).toBe(401);
  });
});
