import { DateText } from "@/components/DateText";

const LABELS: Record<string, string> = {
  invitation_created: "Invitation sent",
  invitation_resent: "Invitation resent",
  invitation_revoked: "Invitation revoked",
  invitation_accepted: "Invitation accepted",
  invitation_expired: "Invitation expired",
  invitation_delivery_failed: "Invitation email not delivered",
  owner_recovered: "Owner role recovered",
  user_disabled: "Access disabled",
  user_enabled: "Access re-enabled",
  user_erased: "User erased",
};

/** Invitation and access-change history for all users (FR-039). Erased users appear as erased:…. */
export function AuditFeed({
  items,
}: {
  items: Array<{ id: number; occurredAt: string; action: string; actorRef: string | null; targetRef: string | null }>;
}) {
  return (
    <section aria-labelledby="audit-title" className="flex flex-col gap-2">
      <h2 id="audit-title" className="text-lg font-medium">
        Access history
      </h2>
      {items.length === 0 ? (
        <p className="text-sm text-muted">No events yet.</p>
      ) : (
        <ul id="audit-feed" className="flex flex-col text-sm">
          {items.map((e) => (
            <li key={e.id} className="border-t border-border py-1">
              <DateText instant={e.occurredAt} /> — {LABELS[e.action] ?? e.action}
              {e.targetRef && <> · {e.targetRef}</>}
              {e.actorRef && <span className="text-muted"> (by {e.actorRef})</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
