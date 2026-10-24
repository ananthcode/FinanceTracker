"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { AdminOverviewResponse } from "@ft/core";
import { DateText } from "@/components/DateText";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api/client";
import { EraseDialog } from "./EraseDialog";

const STATUS_TEXT: Record<string, string> = {
  pending: "pending",
  accepted: "accepted",
  expired: "expired",
  revoked: "revoked",
  superseded: "replaced by a newer invitation",
  active: "active",
  disabled: "disabled",
};

/** Invitations and users with their actions (US4). Status is always shown as text, not colour only. */
export function AdminTables({ overview, ownerId }: { overview: AdminOverviewResponse; ownerId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [erasing, setErasing] = useState<{ id: string; email: string } | null>(null);

  async function act(key: string, path: string, success: string) {
    setBusy(key);
    setMessage(null);
    const res = await apiFetch(path, { method: "POST" });
    setBusy(null);
    setMessage(res.ok ? { ok: true, text: success } : { ok: false, text: res.error?.message ?? "Action failed." });
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-8">
      {message && (
        <Alert id="admin-message" variant={message.ok ? "default" : "destructive"} role="status">
          <AlertDescription>{message.text}</AlertDescription>
        </Alert>
      )}

      <section aria-labelledby="invitations-title" className="flex flex-col gap-2">
        <h2 id="invitations-title" className="text-lg font-medium">
          Invitations
        </h2>
        <table id="invitations-table" className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th scope="col" className="py-1">Email</th>
              <th scope="col">Status</th>
              <th scope="col">Issued</th>
              <th scope="col">Expires</th>
              <th scope="col">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {overview.invitations.map((inv) => (
              <tr key={inv.id} className="border-t border-border">
                <td className="py-1">{inv.email}</td>
                <td>
                  {STATUS_TEXT[inv.status]}
                  {inv.deliveryStatus === "failed" && inv.status === "pending" && " · email not delivered"}
                </td>
                <td>
                  <DateText instant={inv.createdAt} />
                </td>
                <td>
                  <DateText instant={inv.expiresAt} />
                </td>
                <td className="flex gap-2 py-1">
                  {(inv.status === "pending" || inv.status === "expired") && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy !== null}
                      onClick={() => act(`resend-${inv.id}`, `/api/admin/invitations/${inv.id}/resend`, `New invitation emailed to ${inv.email}.`)}
                    >
                      Resend
                    </Button>
                  )}
                  {inv.status === "pending" && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy !== null}
                      onClick={() => act(`revoke-${inv.id}`, `/api/admin/invitations/${inv.id}/revoke`, `Invitation for ${inv.email} revoked.`)}
                    >
                      Revoke
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section aria-labelledby="users-title" className="flex flex-col gap-2">
        <h2 id="users-title" className="text-lg font-medium">
          Users
        </h2>
        <table id="users-table" className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th scope="col" className="py-1">Name</th>
              <th scope="col">Email</th>
              <th scope="col">Access</th>
              <th scope="col">Last sign-in</th>
              <th scope="col">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {overview.users.map((u) => (
              <tr key={u.id} className="border-t border-border">
                <td className="py-1">
                  {u.displayName ?? "—"}
                  {u.role === "owner" && " (owner)"}
                </td>
                <td>{u.email}</td>
                <td>{STATUS_TEXT[u.status]}</td>
                <td>{u.lastSignInAt ? <DateText instant={u.lastSignInAt} /> : "never"}</td>
                <td className="flex gap-2 py-1">
                  {u.id !== ownerId && u.status === "active" && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy !== null}
                      onClick={() => act(`disable-${u.id}`, `/api/admin/users/${u.id}/disable`, `${u.email} can no longer sign in.`)}
                    >
                      Disable
                    </Button>
                  )}
                  {u.id !== ownerId && u.status === "disabled" && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy !== null}
                      onClick={() => act(`enable-${u.id}`, `/api/admin/users/${u.id}/enable`, `${u.email} can sign in again.`)}
                    >
                      Enable
                    </Button>
                  )}
                  {u.id !== ownerId && (
                    <Button size="sm" variant="destructive" disabled={busy !== null} onClick={() => setErasing({ id: u.id, email: u.email })}>
                      Erase
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {erasing && (
        <EraseDialog
          user={erasing}
          onClose={() => setErasing(null)}
          onErased={() => {
            setMessage({ ok: true, text: "The user and all their data were permanently erased." });
            setErasing(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
