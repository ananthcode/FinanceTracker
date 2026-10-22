import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Text, TextInput, View } from "react-native";
import type { AdminAuditResponse, AdminOverviewResponse, CreateInvitationResponse } from "@ft/core";
import { Button } from "@/components/Button";
import { DateText } from "@/components/DateText";
import { useSession } from "@/components/providers/SessionProvider";
import { Screen } from "@/components/Screen";
import { api, ApiCallError } from "@/lib/api";

const STATUS_TEXT: Record<string, string> = {
  pending: "pending",
  accepted: "accepted",
  expired: "expired",
  revoked: "revoked",
  superseded: "replaced by a newer invitation",
  active: "active",
  disabled: "disabled",
};

const AUDIT_LABELS: Record<string, string> = {
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

const rowStyle = { borderTopWidth: 1, borderColor: "#d0d7de", paddingTop: 6, gap: 6 } as const;
const headerStyle = { fontSize: 18, fontWeight: "600" } as const;

/**
 * Owner-admin on Android (T095, US4): same capabilities as the web admin page — invite, resend,
 * revoke, disable/enable, erase (dual confirmation on its own screen) and the access history.
 * Owner-only: the route is guarded in the root layout and every call is checked by the server.
 */
export default function AdminScreen() {
  const { me } = useSession();
  const [overview, setOverview] = useState<AdminOverviewResponse | null>(null);
  const [audit, setAudit] = useState<AdminAuditResponse["items"]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");

  const load = useCallback(async () => {
    try {
      const [o, a] = await Promise.all([
        api<AdminOverviewResponse>("/api/admin/overview"),
        api<AdminAuditResponse>("/api/admin/audit?limit=50"),
      ]);
      setOverview(o);
      setAudit(a.items);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiCallError && e.code === "NETWORK" ? "User management needs a connection." : "Couldn't load users.");
    }
  }, []);

  // Reload on every visit, so the list is fresh after returning from the erase screen.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function act(path: string, body: unknown, success: string) {
    setBusy(true);
    setMessage(null);
    try {
      await api(path, { method: "POST", body });
      setMessage(success);
    } catch (e) {
      setMessage(e instanceof ApiCallError ? e.message : "Action failed.");
    } finally {
      setBusy(false);
      void load();
    }
  }

  async function invite() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await api<CreateInvitationResponse>("/api/admin/invitations", { body: { email } });
      setMessage(
        res.deliveryStatus === "sent"
          ? `Invitation emailed to ${email}.`
          : `Invitation created, but the email could not be sent. Use Resend to try again.`,
      );
      setEmail("");
    } catch (e) {
      setMessage(e instanceof ApiCallError ? e.message : "Couldn't send the invitation.");
    } finally {
      setBusy(false);
      void load();
    }
  }

  return (
    <Screen title="User management">
      <View style={{ gap: 6 }}>
        <Text nativeID="invite-email-label">Invite by email</Text>
        <TextInput
          accessibilityLabelledBy="invite-email-label"
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
          style={{ borderWidth: 1, borderColor: "#d0d7de", borderRadius: 8, padding: 10 }}
        />
        <Button label={busy ? "Working…" : "Send invitation"} onPress={invite} disabled={busy || !email} />
      </View>

      {message && <Text accessibilityLiveRegion="polite">{message}</Text>}
      {error && <Text accessibilityLiveRegion="polite">{error}</Text>}

      <Text accessibilityRole="header" style={headerStyle}>
        Invitations
      </Text>
      {overview?.invitations.length === 0 && <Text>No invitations yet.</Text>}
      {overview?.invitations.map((inv) => (
        <View key={inv.id} style={rowStyle}>
          <Text>{inv.email}</Text>
          <Text style={{ color: "#6e7781" }}>
            {STATUS_TEXT[inv.status]}
            {inv.deliveryStatus === "failed" && inv.status === "pending" ? " · email not delivered" : ""} · expires{" "}
            <DateText instant={inv.expiresAt} />
          </Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {(inv.status === "pending" || inv.status === "expired") && (
              <Button
                label="Resend"
                variant="outline"
                disabled={busy}
                onPress={() => act(`/api/admin/invitations/${inv.id}/resend`, {}, `New invitation emailed to ${inv.email}.`)}
              />
            )}
            {inv.status === "pending" && (
              <Button
                label="Revoke"
                variant="outline"
                disabled={busy}
                onPress={() => act(`/api/admin/invitations/${inv.id}/revoke`, {}, `Invitation for ${inv.email} revoked.`)}
              />
            )}
          </View>
        </View>
      ))}

      <Text accessibilityRole="header" style={headerStyle}>
        Users
      </Text>
      {overview?.users.map((u) => {
        const self = u.id === me?.id;
        return (
          <View key={u.id} style={rowStyle}>
            <Text>
              {u.displayName ?? "—"}
              {u.role === "owner" ? " (owner)" : ""}
            </Text>
            <Text style={{ color: "#6e7781" }}>
              {u.email} · {STATUS_TEXT[u.status]} · last sign-in{" "}
              {u.lastSignInAt ? <DateText instant={u.lastSignInAt} /> : "never"}
            </Text>
            {!self && (
              <View style={{ flexDirection: "row", gap: 8 }}>
                {u.status === "active" ? (
                  <Button
                    label="Disable"
                    variant="outline"
                    disabled={busy}
                    onPress={() => act(`/api/admin/users/${u.id}/disable`, {}, `${u.email} can no longer sign in.`)}
                  />
                ) : (
                  <Button
                    label="Enable"
                    variant="outline"
                    disabled={busy}
                    onPress={() => act(`/api/admin/users/${u.id}/enable`, {}, `${u.email} can sign in again.`)}
                  />
                )}
                <Button
                  label="Erase"
                  variant="outline"
                  disabled={busy}
                  onPress={() => router.push({ pathname: "/admin/erase/[id]", params: { id: u.id, email: u.email } })}
                />
              </View>
            )}
          </View>
        );
      })}

      <Text accessibilityRole="header" style={headerStyle}>
        Access history
      </Text>
      {audit.length === 0 && <Text>No events yet.</Text>}
      {audit.map((e) => (
        <View key={e.id} style={rowStyle}>
          <Text>
            {AUDIT_LABELS[e.action] ?? e.action}
            {e.targetRef ? ` · ${e.targetRef}` : ""}
          </Text>
          <Text style={{ color: "#6e7781" }}>
            <DateText instant={e.occurredAt} />
            {e.actorRef ? ` · by ${e.actorRef}` : ""}
          </Text>
        </View>
      ))}
    </Screen>
  );
}
