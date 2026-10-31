import { router } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { compareNames, peopleTotals, personBalanceOf, type MovementTotals, type PayeeView } from "@ft/core";
import { Button } from "@/components/Button";
import { Money } from "@/components/Money";
import { BalanceWords } from "@/components/PayeeForm";
import { useLists, useMoney } from "@/components/providers/useLists";
import { Screen } from "@/components/Screen";
import { SyncStatusBar } from "@/components/SyncStatusBar";

/**
 * People on Android (R3 US3 on the phone; FR-018, FR-019, FR-034): who owes you and whom you owe,
 * from the phone's store, so it works offline. Every amount goes through <Money> (hide-balances).
 */
export default function PeopleScreen() {
  const { payees } = useLists();
  const people = payees.filter((p) => p.kind === "person").sort((a, b) => compareNames(a.name, b.name));
  const { personTotals } = useMoney();
  const totals = peopleTotals(people, (p) => personBalanceOf(p, personTotals));
  const shown = people.filter((p) => !p.hidden);
  const hidden = people.filter((p) => p.hidden);

  return (
    <Screen title="People">
      <SyncStatusBar />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 16, padding: 12, borderWidth: 1, borderColor: "#d0d7de", borderRadius: 8 }}>
        <View style={{ minWidth: 130 }}>
          <Text style={{ color: "#57606a" }}>People owe you</Text>
          <Money value={totals.owedToYou} style={{ fontSize: 18, fontWeight: "600" }} />
        </View>
        <View style={{ minWidth: 130 }}>
          <Text style={{ color: "#57606a" }}>You owe people</Text>
          <Money value={totals.youOwe} style={{ fontSize: 18, fontWeight: "600" }} />
        </View>
      </View>
      <Button label="Add person" onPress={() => router.push("/people/new")} />
      {people.length === 0 && (
        <Text>No people yet. Add the people you lend to or borrow from — family, friends, a landlord — to keep track of who owes whom.</Text>
      )}
      {shown.map((p) => (
        <PersonRow key={p.id} person={p} totals={personTotals} />
      ))}
      {hidden.length > 0 && (
        <View style={{ gap: 4 }}>
          <Text accessibilityRole="header" style={{ fontSize: 18, fontWeight: "600" }}>
            Hidden people ({hidden.length})
          </Text>
          {hidden.map((p) => (
            <PersonRow key={p.id} person={p} totals={personTotals} />
          ))}
        </View>
      )}
    </Screen>
  );
}

function PersonRow({ person, totals }: { person: PayeeView; totals: MovementTotals }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint="Opens the person"
      onPress={() => router.push(`/people/${person.id}`)}
      style={{ flexDirection: "row", justifyContent: "space-between", gap: 8, paddingVertical: 10, borderTopWidth: 1, borderColor: "#eaeef2" }}
    >
      <View style={{ flex: 1 }}>
        <Text style={{ fontWeight: "600" }}>{person.name}</Text>
        {person.includeInNetWorth && <Text style={{ color: "#57606a", fontSize: 12 }}>In net worth</Text>}
      </View>
      <BalanceWords balance={personBalanceOf(person, totals)} />
    </Pressable>
  );
}
