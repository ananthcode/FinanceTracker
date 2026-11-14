import { useCallback, useEffect, useState } from "react";
import { Alert, Text, TextInput, View } from "react-native";
import { Button } from "@/components/Button";
import { useSession } from "@/components/providers/SessionProvider";
import { useSync } from "@/components/providers/SyncProvider";
import { Screen } from "@/components/Screen";
import { ErrorText, inputStyle, Muted } from "@/components/ui";
import { api, ApiCallError } from "@/lib/api";
import { colours } from "@/lib/theme";

type Action = "load" | "reset" | "reset_and_load";
type Counts = Record<string, number>;
const WORD = "RESET";

const plural = (n: number, one: string, many: string) => `${n.toLocaleString("en-IN")} ${n === 1 ? one : many}`;

/** "8 accounts, 78 categories, …" from the server's counts (loaded: by entity; removed: by table). */
function describe(counts: Counts, kind: "loaded" | "removed"): string {
  const n = (k: string) => counts[k] ?? 0;
  const parts =
    kind === "loaded"
      ? [plural(n("account"), "account", "accounts"), plural(n("category"), "category", "categories"), plural(n("payee"), "payee or person", "payees and people"), plural(n("tag"), "tag", "tags"), plural(n("person_rate"), "interest rate", "interest rates"), plural(n("transaction"), "transaction", "transactions")]
      : [plural(n("accounts"), "account", "accounts"), plural(n("categories"), "category", "categories"), plural(n("payees"), "payee or person", "payees and people"), plural(n("tags"), "tag", "tags"), plural(n("transactions"), "transaction", "transactions")];
  return `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
}

/**
 * Settings → Your data on Android (R5 US4; same rules as the web's section): load the demo household
 * into empty data, reset your own data, or both. Resetting asks for the word RESET. These actions
 * run on the server, so they need a connection; the phone then syncs and shows the new state.
 */
export default function YourDataScreen() {
  const { syncNow } = useSync();
  const { refreshMe } = useSession();
  const [status, setStatus] = useState<{ empty: boolean; demoAvailable: boolean } | null>(null);
  const [offline, setOffline] = useState(false);
  const [asking, setAsking] = useState<"reset" | "reset_and_load" | null>(null);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      setStatus(await api<{ empty: boolean; demoAvailable: boolean }>("/api/me/data"));
      setOffline(false);
    } catch {
      setOffline(true);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  const run = async (action: Action) => {
    setBusy(true);
    setOutcome(null);
    try {
      const res = await api<{ loaded?: Counts; removed?: Counts }>("/api/me/data", { body: action === "load" ? { action } : { action, confirm: WORD } });
      await refreshMe();
      await syncNow();
      await load();
      setOutcome({
        ok: true,
        text:
          action === "load"
            ? `Demo data loaded: ${describe(res.loaded ?? {}, "loaded")}.`
            : action === "reset"
              ? `Your data was reset: ${describe(res.removed ?? {}, "removed")} removed.`
              : `Your data was replaced with fresh demo data: ${describe(res.loaded ?? {}, "loaded")}.`,
      });
      setAsking(null);
      setTyped("");
    } catch (err) {
      setOutcome({ ok: false, text: err instanceof ApiCallError ? err.message : "That did not work. Please try again." });
    } finally {
      setBusy(false);
    }
  };

  const askLoad = () =>
    Alert.alert("Load demo data?", "The demo household is added to your own data. It takes a few seconds.", [
      { text: "Cancel", style: "cancel" },
      { text: "Load demo data", onPress: () => void run("load") },
    ]);

  return (
    <Screen title="Your data">
      <Muted>
        {status?.demoAvailable
          ? "Demo data is a made-up household — accounts, categories, people and about two years of transactions — for trying every screen. It is added to your own data, and you can reset it at any time."
          : "Reset removes everything you have recorded, so you can start again."}
      </Muted>
      {offline && <ErrorText>These actions need a connection. Connect and try again.</ErrorText>}
      {outcome &&
        (outcome.ok ? (
          <Text accessibilityLiveRegion="polite" style={{ color: colours.incomeInk, fontWeight: "600" }}>
            {outcome.text}
          </Text>
        ) : (
          <ErrorText>{outcome.text}</ErrorText>
        ))}
      {offline && <Button label="Try again" variant="outline" onPress={() => void load()} />}
      {status?.empty && status.demoAvailable && <Button label={busy ? "Working…" : "Load demo data"} disabled={busy} onPress={askLoad} />}
      {status && !status.empty && status.demoAvailable && <Button label="Reset and load demo data" variant="outline" disabled={busy} onPress={() => setAsking("reset_and_load")} />}
      {status && !status.empty && <Button label="Reset my data" variant="outline" disabled={busy} onPress={() => setAsking("reset")} />}
      {status?.empty && !status.demoAvailable && <Muted>You have no records yet.</Muted>}

      {asking && (
        <View style={{ gap: 10, backgroundColor: colours.card, borderRadius: 14, padding: 14 }}>
          <Text accessibilityRole="header" style={{ fontSize: 17, fontWeight: "600", color: colours.text }}>
            {asking === "reset" ? "Reset your data?" : "Reset and load demo data?"}
          </Text>
          <Text style={{ color: colours.text }}>
            This permanently removes your accounts, account groups, categories, tags, payees and people, transactions, interest settings and rates, and their history. It cannot be undone.
            {asking === "reset_and_load" && " Then a fresh copy of the demo household is added."}
          </Text>
          <Text style={{ color: colours.text }}>Your sign-in, profile and preferences stay.</Text>
          <Text style={{ fontWeight: "600", color: colours.text }}>Type {WORD} to confirm</Text>
          <TextInput accessibilityLabel={`Type ${WORD} to confirm`} autoCapitalize="characters" autoCorrect={false} value={typed} onChangeText={setTyped} style={inputStyle} />
          <Button label={busy ? "Working…" : asking === "reset" ? "Reset my data" : "Reset and load"} disabled={busy || typed !== WORD} onPress={() => void run(asking)} />
          <Button
            label="Cancel"
            variant="outline"
            disabled={busy}
            onPress={() => {
              setAsking(null);
              setTyped("");
            }}
          />
        </View>
      )}
    </Screen>
  );
}
