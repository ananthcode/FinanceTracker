import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { todayInZone, type ChangeInput, type PullResponse } from "@ft/core";
import { ATTACHMENTS_BUCKET, attachmentPath, attachmentUsage, createBearerClient } from "@ft/db";
import { POST as dataAction } from "@/app/api/me/data/route";
import { PATCH as patchPreferences } from "@/app/api/me/preferences/route";
import { POST as cleanup } from "@/app/api/attachments/cleanup/route";
import { GET as open } from "@/app/api/attachments/[id]/route";
import { POST as uploadLink } from "@/app/api/attachments/route";
import { GET as pull } from "@/app/api/sync/pull/route";
import { POST as push } from "@/app/api/sync/push/route";
import { publicEnv } from "@/lib/env";
import { testAdmin } from "@/test/fixtures";
import { accountFields, bearerRequest, FakeDevice, newMember, type TestMember } from "@/test/sync";

/**
 * R9 T014 — attachments end to end against the local storage: one-time upload links, records that need
 * their file, opening, privacy between users (SC-002), clean-up, and reset (SC-004). Synthetic files only.
 */
const API = "http://localhost:3000/api";
const today = todayInZone("Asia/Kolkata");
const PDF = new TextEncoder().encode("%PDF-1.4\n% a synthetic test file\n%%EOF\n");

async function pushAs(m: TestMember, changes: ChangeInput[]) {
  const res = await push(bearerRequest(`${API}/sync/push`, m.token, "POST", { device: "android", changes }));
  expect(res.status).toBe(200);
  return ((await res.json()) as { results: { status: string; code?: string }[] }).results;
}

/** A member with one account and one expense; returns the transaction id. */
async function withExpense(m: TestMember, d = new FakeDevice()): Promise<string> {
  const [bank, tx] = [randomUUID(), randomUUID()];
  await pushAs(m, [
    d.change("account", bank, "create", accountFields("Everyday Savings", { openingBalanceMinor: "10000000" })),
    d.change("transaction", tx, "create", { kind: "expense", date: today, accountId: bank, amountMinor: "4500000" }),
  ]);
  return tx;
}

async function link(m: TestMember, transactionId: string, sizeBytes: number, contentType = "application/pdf") {
  return uploadLink(bearerRequest(`${API}/attachments`, m.token, "POST", { transactionId, contentType, sizeBytes }));
}

/** Uploads bytes to a one-time link, as the browser does. */
const put = (url: string, bytes: Uint8Array<ArrayBuffer>, contentType = "application/pdf") =>
  fetch(url, { method: "PUT", headers: { "content-type": contentType, "x-upsert": "false" }, body: bytes });

/** Attaches the test PDF to a transaction; returns the attachment id. */
async function attach(m: TestMember, tx: string, d = new FakeDevice()): Promise<string> {
  const res = await link(m, tx, PDF.length);
  expect(res.status).toBe(200);
  const { id, uploadUrl } = (await res.json()) as { id: string; uploadUrl: string };
  expect((await put(uploadUrl, PDF)).status).toBe(200);
  const [result] = await pushAs(m, [
    d.change("attachment", id, "create", { transactionId: tx, name: "Bill.pdf", contentType: "application/pdf", sizeBytes: String(PDF.length) }),
  ]);
  expect(result!.status).toBe("applied");
  return id;
}

const filesOf = async (userId: string) => {
  const { data } = await testAdmin().storage.from(ATTACHMENTS_BUCKET).list(userId, { limit: 1000 });
  return (data ?? []).filter((o) => o.id !== null).map((o) => o.name);
};
const userClient = (m: TestMember) => createBearerClient({ url: publicEnv.supabaseUrl, anonKey: publicEnv.supabaseAnonKey }, m.token);

describe("warranty reminder days (R9-06)", () => {
  it("are set together, the second closer to expiry or off, on every device", async () => {
    const m = await newMember("attprefs");
    const patch = (body: unknown) => patchPreferences(bearerRequest(`${API}/me/preferences`, m.token, "PATCH", body));
    const ok = await patch({ warrantyFirstDays: 90, warrantySecondDays: null });
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as { preferences: Record<string, unknown> }).preferences).toMatchObject({ warrantyFirstDays: 90, warrantySecondDays: null });
    expect((await patch({ warrantyFirstDays: 30, warrantySecondDays: 30 })).status).toBe(400);
    expect((await patch({ warrantyFirstDays: 30 })).status).toBe(400);
  }, 60_000);
});

describe("attachments", () => {
  it("uploads through a one-time link, records it, pulls it and opens it (US1 1, 3)", async () => {
    const m = await newMember("attround");
    const tx = await withExpense(m);
    const id = await attach(m, tx);

    const rows = ((await (await pull(bearerRequest(`${API}/sync/pull?cursor=0`, m.token))).json()) as PullResponse).rows;
    expect(rows.attachment).toHaveLength(1);
    expect(rows.attachment[0]).toMatchObject({ id, transactionId: tx, name: "Bill.pdf", sizeBytes: String(PDF.length) });

    const opened = await open(bearerRequest(`${API}/attachments/${id}`, m.token), { params: Promise.resolve({ id }) });
    expect(opened.status).toBe(302);
    const file = await fetch(opened.headers.get("location")!);
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(PDF);

    expect(await attachmentUsage(userClient(m))).toMatchObject({ files: 1, bytes: BigInt(PDF.length), allowance: 209_715_200n });
  }, 60_000);

  it("refuses a record without its file, and files the bucket does not take", async () => {
    const m = await newMember("attrefuse");
    const tx = await withExpense(m);
    const [result] = await pushAs(m, [
      new FakeDevice().change("attachment", randomUUID(), "create", { transactionId: tx, name: "Ghost.pdf", contentType: "application/pdf", sizeBytes: "100" }),
    ]);
    expect(result).toMatchObject({ status: "rejected", code: "INVALID_ATTACHMENT" });

    const res = await link(m, tx, 10, "application/pdf");
    const { uploadUrl } = (await res.json()) as { uploadUrl: string };
    expect((await put(uploadUrl, new TextEncoder().encode("plain text"), "text/plain")).ok).toBe(false);
    expect((await link(m, tx, 11 * 1024 * 1024)).status).toBe(400);
  }, 60_000);

  it("keeps each user's files private (FR-003, SC-002)", async () => {
    const [a, b] = [await newMember("attowner"), await newMember("attother")];
    const tx = await withExpense(a);
    const id = await attach(a, tx);
    const path = attachmentPath(a.id, id);

    expect((await open(bearerRequest(`${API}/attachments/${id}`, b.token), { params: Promise.resolve({ id }) })).status).toBe(404);
    expect((await link(b, tx, 10)).status).toBe(404);
    const other = userClient(b).storage.from(ATTACHMENTS_BUCKET);
    expect((await other.list(a.id)).data ?? []).toHaveLength(0);
    expect((await other.createSignedUrl(path, 60)).data).toBeNull();
    expect((await other.download(path)).data).toBeNull();
    expect((await other.createSignedUploadUrl(attachmentPath(a.id, randomUUID()))).data).toBeNull();
    await other.remove([path]);
    expect(await filesOf(a.id)).toEqual([id]);
  }, 60_000);

  it("removes the files of deleted attachments and of a deleted transaction (US1 3, clarify Q2)", async () => {
    const m = await newMember("attclean");
    const d = new FakeDevice();
    const tx = await withExpense(m, d);
    const [first, second] = [await attach(m, tx, d), await attach(m, tx, d)];
    await pushAs(m, [d.change("attachment", first, "delete")]);
    const res = await cleanup(bearerRequest(`${API}/attachments/cleanup`, m.token, "POST"));
    expect(await res.json()).toEqual({ removed: 1 });
    expect(await filesOf(m.id)).toEqual([second]);

    await pushAs(m, [d.change("transaction", tx, "delete")]);
    await cleanup(bearerRequest(`${API}/attachments/cleanup`, m.token, "POST"));
    expect(await filesOf(m.id)).toEqual([]);
  }, 60_000);

  it("a reset removes every file; a demo load stores the demo receipt (SC-004, FR-014)", async () => {
    const m = await newMember("attreset");
    const tx = await withExpense(m);
    await attach(m, tx);
    const reset = await dataAction(bearerRequest(`${API}/me/data`, m.token, "POST", { action: "reset", confirm: "RESET" }));
    expect(reset.status).toBe(200);
    expect(((await reset.json()) as { removed: Record<string, number> }).removed).toMatchObject({ attachments: 1 });
    expect(await filesOf(m.id)).toEqual([]);

    const load = await dataAction(bearerRequest(`${API}/me/data`, m.token, "POST", { action: "load" }));
    expect(load.status).toBe(200);
    expect(((await load.json()) as { loaded: Record<string, number> }).loaded).toMatchObject({ attachment: 1 });
    const stored = await filesOf(m.id);
    expect(stored).toHaveLength(1);
    const { data } = await testAdmin().from("attachments").select("id, transaction_id").eq("user_id", m.id);
    expect(data).toHaveLength(1);
    expect(data![0]!.id).toBe(stored[0]);

    const again = await dataAction(bearerRequest(`${API}/me/data`, m.token, "POST", { action: "reset_and_load", confirm: "RESET" }));
    expect(again.status).toBe(200);
    const after = await filesOf(m.id);
    expect(after).toHaveLength(1);
    expect(after[0]).not.toBe(stored[0]);
  }, 120_000);
});
