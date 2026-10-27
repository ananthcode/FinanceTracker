/**
 * Sync protocol shapes (contracts/sync-protocol.md). These are the only accepted shapes for push
 * and pull (Principle VIII). A change that fails them makes the whole push fail with 422; checks
 * only the database can make reject a single change inside a 200 response.
 */
import { z } from "zod";
import { AccountCreateFields, AccountUpdateFields, GroupCreateFields, GroupUpdateFields } from "../accounts/schemas";
import { HLC_PATTERN } from "./hlc";

export const SYNC_ENTITIES = ["account", "account_group"] as const;
export type SyncEntity = (typeof SYNC_ENTITIES)[number];

export const CHANGE_KINDS = ["create", "update", "archive", "restore", "delete"] as const;
export type ChangeKind = (typeof CHANGE_KINDS)[number];

export const MAX_CHANGES_PER_PUSH = 100;

const FIELD_SCHEMAS: Record<SyncEntity, Partial<Record<ChangeKind, z.ZodType>>> = {
  account: { create: AccountCreateFields, update: AccountUpdateFields },
  account_group: { create: GroupCreateFields, update: GroupUpdateFields },
};

/** Groups are only created, renamed, reordered and deleted (FR-009a). */
const ALLOWED_KINDS: Record<SyncEntity, readonly ChangeKind[]> = {
  account: CHANGE_KINDS,
  account_group: ["create", "update", "delete"],
};

export const Change = z
  .object({
    changeId: z.uuid(),
    entity: z.enum(SYNC_ENTITIES),
    entityId: z.uuid(),
    kind: z.enum(CHANGE_KINDS),
    fields: z.record(z.string(), z.unknown()).optional(),
    hlc: z.string().regex(HLC_PATTERN),
    options: z.object({ onNameConflict: z.enum(["reject", "suffix"]) }).strict().optional(),
  })
  .strict()
  .transform((change, ctx) => {
    if (!ALLOWED_KINDS[change.entity].includes(change.kind)) {
      ctx.addIssue({ code: "custom", message: `${change.entity} cannot be ${change.kind}d`, path: ["kind"] });
      return z.NEVER;
    }
    const schema = FIELD_SCHEMAS[change.entity][change.kind];
    if (!schema) {
      if (change.fields && Object.keys(change.fields).length > 0) {
        ctx.addIssue({ code: "custom", message: `${change.kind} takes no fields`, path: ["fields"] });
        return z.NEVER;
      }
      return { ...change, fields: {} as Record<string, unknown> };
    }
    const parsed = schema.safeParse(change.fields ?? {});
    if (!parsed.success) {
      for (const issue of parsed.error.issues) ctx.addIssue({ ...issue, path: ["fields", ...issue.path] } as never);
      return z.NEVER;
    }
    return { ...change, fields: parsed.data as Record<string, unknown> };
  });

export type Change = z.output<typeof Change>;
export type ChangeInput = z.input<typeof Change>;

export const PushRequest = z
  .object({
    device: z.enum(["web", "android"]),
    changes: z.array(Change).min(1).max(MAX_CHANGES_PER_PUSH),
  })
  .strict();
export type PushRequest = z.output<typeof PushRequest>;

export const REJECTION_CODES = [
  "VALIDATION_FAILED",
  "NAME_TAKEN",
  "GROUP_NAME_TAKEN",
  "BALANCE_NOT_ZERO",
  "HAS_ACTIVITY",
  "LIMIT_REACHED",
  "DATE_IN_FUTURE",
  "NOT_FOUND",
] as const;
export type RejectionCode = (typeof REJECTION_CODES)[number];

export const ChangeResult = z.object({
  changeId: z.uuid(),
  status: z.enum(["applied", "duplicate", "renamed", "converted", "rejected"]),
  appliedFields: z.array(z.string()).default([]),
  ignoredFields: z.array(z.string()).default([]),
  renamedTo: z.string().optional(),
  code: z.enum(REJECTION_CODES).optional(),
  clamped: z.boolean().default(false),
});
export type ChangeResult = z.output<typeof ChangeResult>;

export const PushResponse = z.object({ results: z.array(ChangeResult) });
export type PushResponse = z.output<typeof PushResponse>;

/** A pulled row: every column, camelCase, money as minor-unit strings. */
const PulledRow = z.object({ id: z.uuid(), serverSeq: z.string().regex(/^\d+$/) }).loose();

export const PullResponse = z.object({
  cursor: z.string().regex(/^\d+$/),
  hasMore: z.boolean(),
  rows: z.object({ account: z.array(PulledRow), account_group: z.array(PulledRow) }),
});
export type PullResponse = z.output<typeof PullResponse>;
