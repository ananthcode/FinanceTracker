import { demoAccounts, demoLists, keysBetween } from "@ft/core";
import { createServiceRoleClient } from "@ft/db";
import { newInvitationToken, toByteaHex } from "@ft/db/server";

/**
 * E2E database helpers — LOCAL STACK ONLY. Every destructive helper refuses to run unless the
 * Supabase URL points at this machine, and touches only synthetic @example.com data.
 */
function assertLocal(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const host = new URL(url).hostname;
  if (host !== "127.0.0.1" && host !== "localhost") {
    throw new Error(`Refusing to touch a non-local database (${host}).`);
  }
  return url;
}

export function admin() {
  return createServiceRoleClient(assertLocal(), process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export function uniqueEmail(prefix: string): string {
  return `${prefix}.${Math.random().toString(36).slice(2, 8)}@example.com`;
}

/** Removes all synthetic users and invitations from earlier runs. */
export async function resetSyntheticData(): Promise<void> {
  const db = admin();
  const { data } = await db.auth.admin.listUsers({ perPage: 1000 });
  for (const u of data?.users ?? []) {
    if (u.email?.endsWith("@example.com")) await db.auth.admin.deleteUser(u.id);
  }
  await db.from("invitations").delete().like("email", "%@example.com");
}

export async function seedInvitation(
  email: string,
  opts: { role?: "owner" | "member"; status?: "pending" | "revoked"; expired?: boolean } = {},
): Promise<string> {
  const { token, tokenHash } = newInvitationToken();
  const created = opts.expired ? new Date(Date.now() - 8 * 86_400_000) : new Date();
  const { error } = await admin()
    .from("invitations")
    .insert({
      email,
      role: opts.role ?? "member",
      status: opts.status ?? "pending",
      token_hash: toByteaHex(tokenHash),
      created_at: created.toISOString(),
      expires_at: new Date(created.getTime() + 7 * 86_400_000).toISOString(),
    });
  if (error) throw new Error(error.message);
  return token;
}

/**
 * Seeds accounts for a synthetic user straight into the LOCAL database (T067): the deterministic
 * demo set (packages/core demoAccounts) and/or `active` + `archived` generated accounts. Rows go
 * through the normal triggers (sync stamp, change history).
 */
export async function seedAccounts(
  email: string,
  opts: { demo?: boolean; active?: number; archived?: number } = {},
): Promise<void> {
  const db = admin();
  const { data: profile, error } = await db.from("profiles").select("user_id").eq("email", email).single();
  if (error || !profile) throw new Error(`seedAccounts: no profile for ${email}`);
  const userId = profile.user_id as string;
  const uid = () => crypto.randomUUID();
  const rows: Record<string, unknown>[] = [];

  if (opts.demo) {
    const demo = demoAccounts();
    // Demo ids are fixed; give each seeded user their own copies.
    const groupIds = new Map(demo.groups.map((g) => [g.id, uid()]));
    const { error: gErr } = await db.from("account_groups").insert(
      demo.groups.map((g) => ({ id: groupIds.get(g.id), user_id: userId, name: g.name, sort_key: g.sortKey })),
    );
    if (gErr) throw new Error(gErr.message);
    for (const a of demo.accounts) {
      rows.push({
        id: uid(), user_id: userId, name: a.name, type: a.type, opening_balance_minor: a.openingBalanceMinor.toString(),
        opening_balance_date: a.openingBalanceDate, currency: a.currency, colour: a.colour, icon: a.icon, sort_key: a.sortKey,
        group_id: a.groupId ? groupIds.get(a.groupId) : null, include_in_net_worth: a.includeInNetWorth, notes: a.notes,
        credit_limit_minor: a.creditLimitMinor?.toString() ?? null, state: a.state,
      });
    }
  }

  const generated = (opts.active ?? 0) + (opts.archived ?? 0);
  const keys = keysBetween("a9", null, generated); // after the demo set's keys
  for (let i = 0; i < generated; i++) {
    const archived = i >= (opts.active ?? 0);
    rows.push({
      id: uid(), user_id: userId, name: `${archived ? "Archived" : "Seeded"} account ${i + 1}`, type: "cash",
      opening_balance_minor: archived ? "0" : String(10_000 + i), opening_balance_date: "2026-04-01", currency: "INR",
      colour: "green", icon: "banknote", sort_key: keys[i], state: archived ? "archived" : "active",
      // A bulk insert fills missing columns with NULL, not their defaults: give every row all of them.
      group_id: null, include_in_net_worth: true, notes: null, credit_limit_minor: null,
    });
  }
  if (rows.length) {
    const { error: aErr } = await db.from("accounts").insert(rows);
    if (aErr) throw new Error(aErr.message);
  }
}

/**
 * Seeds categories, tags and payees for a user (R3 T075): the demo lists, and/or `categories` and
 * `payees` generated ones (for the performance test). Records the start choice, so the dialog does
 * not open. Ids are fresh per user; parents and default categories are mapped to them.
 */
export async function seedLists(email: string, opts: { demo?: boolean; categories?: number; payees?: number } = {}): Promise<void> {
  const db = admin();
  const { data: profile, error } = await db.from("profiles").select("user_id").eq("email", email).single();
  if (error || !profile) throw new Error(`seedLists: no profile for ${email}`);
  const userId = profile.user_id as string;
  const fresh = new Map<string, string>();
  const idFor = (demoId: string) => fresh.get(demoId) ?? fresh.set(demoId, crypto.randomUUID()).get(demoId)!;
  const categories: Record<string, unknown>[] = [];
  const tags: Record<string, unknown>[] = [];
  const payees: Record<string, unknown>[] = [];
  // A bulk insert fills missing columns with NULL, not their defaults: give every row all of them.
  const category = (id: string, name: string, kind: string, parentId: string | null, colour: string, icon: string, hidden = false) =>
    categories.push({ id, user_id: userId, name, kind, parent_id: parentId, colour, icon, hidden });
  const payee = (p: { id: string; name: string; kind: string; defaultCategoryId: string | null; notes: string | null; hidden: boolean;
    openingBalanceMinor: bigint; openingBalanceDate: string | null; includeInNetWorth: boolean }) =>
    payees.push({
      id: p.id, user_id: userId, name: p.name, kind: p.kind, default_category_id: p.defaultCategoryId, notes: p.notes,
      hidden: p.hidden, opening_balance_minor: p.openingBalanceMinor.toString(), opening_balance_date: p.openingBalanceDate,
      include_in_net_worth: p.includeInNetWorth,
    });

  if (opts.demo) {
    const demo = demoLists();
    for (const c of demo.categories) category(idFor(c.id), c.name, c.kind, c.parentId ? idFor(c.parentId) : null, c.colour, c.icon, c.hidden);
    for (const t of demo.tags) tags.push({ id: idFor(t.id), user_id: userId, name: t.name });
    for (const p of demo.payees) payee({ ...p, id: idFor(p.id), defaultCategoryId: p.defaultCategoryId ? idFor(p.defaultCategoryId) : null });
  }
  // Generated: top-level categories with nine sub-categories each, then businesses defaulting to them.
  const generatedIds: string[] = [];
  for (let i = 0; i < (opts.categories ?? 0); i += 10) {
    const parent = crypto.randomUUID();
    category(parent, `Seeded group ${i / 10 + 1}`, "expense", null, "slate", "package");
    generatedIds.push(parent);
    for (let j = 1; j < 10 && i + j < (opts.categories ?? 0); j++) {
      const child = crypto.randomUUID();
      category(child, `Seeded category ${i + j}`, "expense", parent, "slate", "package");
      generatedIds.push(child);
    }
  }
  for (let i = 0; i < (opts.payees ?? 0); i++) {
    payee({
      id: crypto.randomUUID(), name: `Seeded payee ${i + 1}`, kind: "business",
      defaultCategoryId: generatedIds.length ? generatedIds[i % generatedIds.length]! : null, notes: null, hidden: false,
      openingBalanceMinor: 0n, openingBalanceDate: null, includeInNetWorth: false,
    });
  }

  for (const [table, rows] of [["categories", categories], ["tags", tags], ["payees", payees]] as const) {
    // Parents before children: rows are inserted in the order they were built.
    for (let i = 0; i < rows.length; i += 500) {
      const { error: err } = await db.from(table).insert(rows.slice(i, i + 500));
      if (err) throw new Error(`seedLists ${table}: ${err.message}`);
    }
  }
  const { error: pErr } = await db.from("user_preferences").update({ categories_start: "suggested" }).eq("user_id", userId);
  if (pErr) throw new Error(pErr.message);
}

/** First-run setup is US3; until then tests complete it directly. */
export async function completeSetup(email: string, displayName: string): Promise<void> {
  const { error } = await admin()
    .from("profiles")
    .update({ display_name: displayName, setup_completed_at: new Date().toISOString() })
    .eq("email", email);
  if (error) throw new Error(error.message);
}

export async function userExists(email: string): Promise<boolean> {
  const { count } = await admin().from("profiles").select("user_id", { count: "exact", head: true }).eq("email", email);
  return (count ?? 0) > 0;
}
