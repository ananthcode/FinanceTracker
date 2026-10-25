"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { AccountView, ChangeResult } from "@ft/core";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Money } from "@/components/Money";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { changes, useSyncPush } from "@/lib/sync-client";

const MESSAGES: Partial<Record<NonNullable<ChangeResult["code"]>, string>> = {
  BALANCE_NOT_ZERO: "The balance must be ₹0.00 before the account can be archived.",
  HAS_ACTIVITY: "This account has been used, so it can't be deleted. Bring its balance to ₹0.00 and archive it instead.",
  NOT_FOUND: "This account no longer exists.",
};

/**
 * Archive / restore / delete (R2 US4; FR-021–FR-024). Archiving needs a ₹0.00 balance so it never
 * changes net worth; delete is only for accounts that have never been used (the server decides —
 * an account with history is archived instead, or refused).
 */
export function AccountActions({ account, balance }: { account: AccountView; balance: bigint }) {
  const router = useRouter();
  const push = useSyncPush();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function run(change: Parameters<typeof push>[0][number]) {
    setBusy(true);
    setMessage(null);
    const outcome = await push([change]);
    setBusy(false);
    setConfirmDelete(false);
    if (!outcome.ok) return setMessage(outcome.error.message);
    const result = outcome.results[0];
    if (result?.status === "rejected") {
      return setMessage((result.code && MESSAGES[result.code]) ?? "That didn't work. Please try again.");
    }
    if (result?.status === "converted") {
      // An account with history was archived instead of deleted (FR-034).
      router.push("/accounts?notice=converted");
      return;
    }
    router.push("/accounts");
  }

  const archived = account.state === "archived";
  const canArchive = balance === 0n;

  return (
    <section aria-labelledby="manage-title" className="flex max-w-xl flex-col gap-3 border-t border-border pt-5">
      <h2 id="manage-title" className="text-lg font-medium">
        Manage account
      </h2>
      {message && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      )}

      {archived ? (
        <div className="flex flex-col items-start gap-1">
          <Button type="button" variant="outline" disabled={busy} onClick={() => void run(changes.restoreAccount(account.id))}>
            Restore account
          </Button>
          <p className="text-sm text-muted-foreground">It goes back to its place in your accounts and counts in totals again.</p>
        </div>
      ) : (
        <div className="flex flex-col items-start gap-1">
          <Button
            type="button"
            variant="outline"
            disabled={busy || !canArchive}
            aria-describedby="archive-help"
            onClick={() => void run(changes.archiveAccount(account.id))}
          >
            Archive account
          </Button>
          <p id="archive-help" className="text-sm text-muted-foreground">
            {canArchive ? (
              "Archived accounts leave your everyday lists; their history is kept and you can restore them."
            ) : (
              <>
                To archive, the balance must be ₹0.00. It is <Money value={balance} currency={account.currency} /> now —
                settle it, or correct the opening balance above.
              </>
            )}
          </p>
        </div>
      )}

      <div className="flex flex-col items-start gap-1">
        <Button type="button" variant="destructive" disabled={busy} onClick={() => setConfirmDelete(true)}>
          Delete account
        </Button>
        <p className="text-sm text-muted-foreground">Only for an account added by mistake and never used.</p>
      </div>

      {confirmDelete && (
        <ConfirmDialog
          title={`Delete ${account.name}?`}
          confirmLabel="Delete account"
          destructive
          busy={busy}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => void run(changes.deleteAccount(account.id))}
        >
          <p>It will be removed from every screen. Its history is kept.</p>
          <p>An account that has been used cannot be deleted — archive it instead.</p>
        </ConfirmDialog>
      )}
    </section>
  );
}
