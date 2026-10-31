"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { DEVICE_ID_PATTERN, formatHlc, nextHlc, parseHlc, type ChangeInput, type ChangeResult, type HlcParts } from "@ft/core";
import { apiFetch } from "@/lib/api/client";

/**
 * Browser side of the sync protocol (T033, research R2-05). The web writes through the same
 * push endpoint as Android, sending only the fields the user changed, stamped with this browser's
 * hybrid logical clock so the per-field rule (FR-030) also decides edits from two tabs.
 */
const DEVICE_KEY = "ft.deviceId";
const HLC_KEY = "ft.hlc";

let memoryDevice: string | null = null;
let memoryHlc: HlcParts | null = null;

function randomDeviceId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (b) => (b % 36).toString(36)).join("") + "web0";
}

/** A random id for this browser profile, created once (stored per browser, never sent elsewhere). */
export function deviceId(): string {
  try {
    const stored = window.localStorage.getItem(DEVICE_KEY);
    if (stored && DEVICE_ID_PATTERN.test(stored)) return stored;
    const created = randomDeviceId();
    window.localStorage.setItem(DEVICE_KEY, created);
    return created;
  } catch {
    // Storage unavailable (private mode): keep an id for this page's lifetime.
    memoryDevice ??= randomDeviceId();
    return memoryDevice;
  }
}

/** The next HLC for a change made now in this browser. */
export function nextChangeHlc(now = Date.now()): string {
  const device = deviceId();
  let last = memoryHlc;
  try {
    const stored = window.localStorage.getItem(HLC_KEY);
    if (stored) last = parseHlc(stored);
  } catch {
    // keep the in-memory clock
  }
  const next = nextHlc(last && last.device === device ? last : null, now, device);
  memoryHlc = next;
  const text = formatHlc(next);
  try {
    window.localStorage.setItem(HLC_KEY, text);
  } catch {
    // ignore — the in-memory clock still advances
  }
  return text;
}

export function newChange(
  entity: ChangeInput["entity"],
  entityId: string,
  kind: ChangeInput["kind"],
  fields?: Record<string, unknown>,
  options?: ChangeInput["options"],
): ChangeInput {
  return {
    changeId: crypto.randomUUID(),
    entity,
    entityId,
    kind,
    ...(fields ? { fields } : {}),
    hlc: nextChangeHlc(),
    ...(options ? { options } : {}),
  };
}

/** Change builders. Updates carry only the fields that changed. */
export const changes = {
  createAccount: (id: string, fields: Record<string, unknown>) => newChange("account", id, "create", fields, { onNameConflict: "reject" }),
  updateAccount: (id: string, changed: Record<string, unknown>) => newChange("account", id, "update", changed),
  archiveAccount: (id: string) => newChange("account", id, "archive"),
  restoreAccount: (id: string) => newChange("account", id, "restore"),
  deleteAccount: (id: string) => newChange("account", id, "delete"),
  createGroup: (id: string, fields: { name: string; sortKey: string }) =>
    newChange("account_group", id, "create", fields, { onNameConflict: "reject" }),
  updateGroup: (id: string, changed: Record<string, unknown>) => newChange("account_group", id, "update", changed),
  deleteGroup: (id: string) => newChange("account_group", id, "delete"),
  // R3: categories, tags and payees. A merge moves everything from `id` to `targetId` (R3-05).
  createCategory: (id: string, fields: Record<string, unknown>) =>
    newChange("category", id, "create", fields, { onNameConflict: "reject" }),
  updateCategory: (id: string, changed: Record<string, unknown>) => newChange("category", id, "update", changed),
  deleteCategory: (id: string) => newChange("category", id, "delete"),
  mergeCategory: (id: string, targetId: string) => newChange("category", id, "merge", { targetId }),
  createTag: (id: string, name: string) => newChange("tag", id, "create", { name }, { onNameConflict: "reject" }),
  renameTag: (id: string, name: string) => newChange("tag", id, "update", { name }),
  deleteTag: (id: string) => newChange("tag", id, "delete"),
  mergeTag: (id: string, targetId: string) => newChange("tag", id, "merge", { targetId }),
  createPayee: (id: string, fields: Record<string, unknown>) =>
    newChange("payee", id, "create", fields, { onNameConflict: "reject" }),
  updatePayee: (id: string, changed: Record<string, unknown>) => newChange("payee", id, "update", changed),
  deletePayee: (id: string) => newChange("payee", id, "delete"),
  mergePayee: (id: string, targetId: string) => newChange("payee", id, "merge", { targetId }),
  // R4: transactions and person rates; relocate keeps the source (FR-019).
  createTransaction: (id: string, fields: Record<string, unknown>) => newChange("transaction", id, "create", fields),
  updateTransaction: (id: string, changed: Record<string, unknown>) => newChange("transaction", id, "update", changed),
  deleteTransaction: (id: string) => newChange("transaction", id, "delete"),
  confirmTransactions: (ids: string[]) => ids.map((id) => newChange("transaction", id, "update", { confirmed: true })),
  createPersonRate: (id: string, fields: { payeeId: string; effectiveMonth: string; rateE4: number }) =>
    newChange("person_rate", id, "create", fields),
  updatePersonRate: (id: string, changed: Record<string, unknown>) => newChange("person_rate", id, "update", changed),
  deletePersonRate: (id: string) => newChange("person_rate", id, "delete"),
  relocateCategory: (id: string, targetId: string) => newChange("category", id, "relocate", { targetId }),
  relocatePayee: (id: string, targetId: string) => newChange("payee", id, "relocate", { targetId }),
};

export type PushOutcome =
  | { ok: true; results: ChangeResult[] }
  | { ok: false; error: { code: string; message: string } };

export async function pushChanges(list: ChangeInput[]): Promise<PushOutcome> {
  const res = await apiFetch<{ results: ChangeResult[] }>("/api/sync/push", { body: { device: "web", changes: list } });
  if (!res.ok || !res.data) return { ok: false, error: res.error ?? { code: "INTERNAL", message: "Something went wrong." } };
  return { ok: true, results: res.data.results };
}

/** Pushes changes and, when anything was accepted, re-renders the server data (FR-014). */
export function useSyncPush(): (list: ChangeInput[]) => Promise<PushOutcome> {
  const router = useRouter();
  return useCallback(
    async (list: ChangeInput[]) => {
      const outcome = await pushChanges(list);
      if (outcome.ok && outcome.results.some((r) => r.status !== "rejected")) router.refresh();
      return outcome;
    },
    [router],
  );
}
