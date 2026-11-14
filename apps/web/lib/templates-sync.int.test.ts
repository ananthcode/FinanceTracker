import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { addMonths, monthOf, recordFromTemplate, todayInZone, type ChangeInput, type PullResponse, type TemplateView } from "@ft/core";
import { POST as push } from "@/app/api/sync/push/route";
import { GET as pull } from "@/app/api/sync/pull/route";
import { accountFields, bearerRequest, FakeDevice, newMember, type TestMember } from "@/test/sync";

/** R8 T012 — templates through the R2 sync endpoints, and a recording from a tied template. */
const BASE = "http://localhost:3000/api/sync";
const today = todayInZone("Asia/Kolkata");
const thisMonth = monthOf(today);

async function pushAs(m: TestMember, changes: ChangeInput[]) {
  const res = await push(bearerRequest(`${BASE}/push`, m.token, "POST", { device: "android", changes }));
  expect(res.status).toBe(200);
  return ((await res.json()) as { results: { status: string; code?: string; ignoredFields: string[] }[] }).results;
}

async function pullRows(m: TestMember): Promise<PullResponse["rows"]> {
  const res = await pull(bearerRequest(`${BASE}/pull?cursor=0`, m.token));
  expect(res.status).toBe(200);
  return ((await res.json()) as PullResponse).rows;
}

describe("templates through push and pull", () => {
  it("pushes a template, pulls it back, and two devices' edits merge per field", async () => {
    const m = await newMember("tplsync");
    const [phone, tablet] = [new FakeDevice(), new FakeDevice()];
    const [bank, id] = [randomUUID(), randomUUID()];
    await pushAs(m, [phone.change("account", bank, "create", accountFields("Everyday Savings", { openingBalanceMinor: "10000000" }))]);
    const results = await pushAs(m, [phone.change("template", id, "create", { name: "Milk", kind: "expense", accountId: bank, amountMinor: "6000", sortKey: "a0" })]);
    expect(results[0]!.status).toBe("applied");
    const t = Date.now();
    await pushAs(m, [phone.change("template", id, "update", { name: "Morning milk" }, {}, t)]);
    await pushAs(m, [tablet.change("template", id, "update", { hidden: true }, {}, t + 1000)]);
    const rows = await pullRows(m);
    expect(rows.template).toHaveLength(1);
    expect(rows.template[0]).toMatchObject({ id, name: "Morning milk", hidden: true, amountMinor: "6000", flow: "out" });
    expect(rows.template[0]).not.toHaveProperty("userId");
  });

  it("a recording from a tied template is an ordinary transaction linked to the planned payment", async () => {
    const m = await newMember("tpltie");
    const d = new FakeDevice();
    const [bank, landlord, item, tplId] = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
    await pushAs(m, [
      d.change("account", bank, "create", accountFields("Everyday Savings", { openingBalanceMinor: "10000000" })),
      d.change("payee", landlord, "create", { name: "Landlord", kind: "business" }, { options: { onNameConflict: "reject" } }),
      d.change("plan_item", item, "create", {
        name: "Rent", target: "payee", payeeId: landlord, frequency: "monthly", intervalMonths: 1, startMonth: thisMonth,
        terms: [{ fromMonth: thisMonth, amountMinor: "2500000", dueDay: 5, accountId: bank }],
      }),
      d.change("template", tplId, "create", { name: "Rent", kind: "expense", accountId: bank, amountMinor: "2500000", payeeId: landlord, planItemId: item, sortKey: "a0" }),
    ]);
    const template: TemplateView = {
      id: tplId, name: "Rent", kind: "expense", flow: "out", accountId: bank, toAccountId: null, amountMinor: 2_500_000n, payeeId: landlord,
      personAction: null, categoryId: null, lines: [], tagIds: [], notes: null, planItemId: item, sortKey: "a0", hidden: false, state: "active",
    };
    const tx = randomUUID();
    const fields = recordFromTemplate(template, { amountMinor: 2_500_000n, today, pays: { itemId: item, month: thisMonth }, newId: randomUUID });
    expect((await pushAs(m, [d.change("transaction", tx, "create", fields)]))[0]!.status).toBe("applied");
    const rows = await pullRows(m);
    expect(rows.transaction.find((r) => r.id === tx)).toMatchObject({ planItemId: item, planMonth: thisMonth, amountMinor: "2500000", date: today });
    // A tie to a month the item does not have is refused by R7's link rules.
    const bad = recordFromTemplate(template, { amountMinor: 100n, today, pays: { itemId: item, month: addMonths(thisMonth, -1) }, newId: randomUUID });
    expect((await pushAs(m, [d.change("transaction", randomUUID(), "create", bad)]))[0]).toMatchObject({ status: "rejected", code: "INVALID_PLAN_LINK" });
  });
});
