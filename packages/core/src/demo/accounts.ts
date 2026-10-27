/**
 * Deterministic demo accounts (constitution X, task T066). Synthetic only — no real banks, names
 * or amounts (constitution V). R5's "Load demo data / reset my data" inserts this set; R2 uses it
 * in tests and the e2e seed helper. Every call returns exactly the same data.
 *
 * Covers every account type, every balance label (owed, in credit, overdrawn), a card with a
 * credit limit, an account excluded from net worth, an archived account at ₹0.00, two user groups
 * and an ungrouped account.
 */
import type { AccountType, AccountView, GroupView } from "../accounts/types";
import { keysBetween } from "../ordering/keys";

const OPENING_DATE = "2025-04-01"; // start of the Apr–Mar financial year

const group = (n: number) => `00000000-0000-4000-8000-00000000d1${String(n).padStart(2, "0")}`;
const account = (n: number) => `00000000-0000-4000-8000-00000000d0${String(n).padStart(2, "0")}`;

interface DemoSpec {
  name: string;
  type: AccountType;
  opening: bigint;
  colour: string;
  icon: string;
  groupId: string | null;
  includeInNetWorth?: boolean;
  creditLimit?: bigint;
  state?: "active" | "archived";
  notes?: string;
}

const MY_ACCOUNTS = group(1);
const HELD_FOR_FAMILY = group(2);

const SPECS: DemoSpec[] = [
  { name: "Everyday Savings", type: "bank", opening: 5_234_050n, colour: "blue", icon: "bank", groupId: MY_ACCOUNTS },
  { name: "Joint Current", type: "bank", opening: -125_000n, colour: "teal", icon: "building", groupId: MY_ACCOUNTS },
  { name: "Cash in hand", type: "cash", opening: 200_000n, colour: "green", icon: "banknote", groupId: null },
  { name: "Mobile Wallet", type: "wallet", opening: 75_050n, colour: "purple", icon: "smartphone", groupId: MY_ACCOUNTS },
  {
    name: "Rewards Card",
    type: "credit_card",
    opening: 1_825_000n,
    colour: "orange",
    icon: "credit-card",
    groupId: MY_ACCOUNTS,
    creditLimit: 5_000_000n,
  },
  { name: "Travel Card", type: "credit_card", opening: -120_000n, colour: "indigo", icon: "plane", groupId: MY_ACCOUNTS },
  {
    name: "Family Savings",
    type: "bank",
    opening: 10_000_000n,
    colour: "brown",
    icon: "users",
    groupId: HELD_FOR_FAMILY,
    includeInNetWorth: false,
    notes: "Kept for a family member; not counted in net worth.",
  },
  { name: "Old Wallet", type: "wallet", opening: 0n, colour: "slate", icon: "wallet", groupId: null, state: "archived" },
];

export interface DemoAccounts {
  groups: GroupView[];
  accounts: AccountView[];
}

export function demoAccounts(currency = "INR"): DemoAccounts {
  const groupKeys = keysBetween(null, null, 2);
  const accountKeys = keysBetween(null, null, SPECS.length);
  return {
    groups: [
      { id: MY_ACCOUNTS, name: "My accounts", sortKey: groupKeys[0]!, state: "active" },
      { id: HELD_FOR_FAMILY, name: "Held for family", sortKey: groupKeys[1]!, state: "active" },
    ],
    accounts: SPECS.map((s, i) => ({
      id: account(i + 1),
      name: s.name,
      type: s.type,
      openingBalanceMinor: s.opening,
      openingBalanceDate: OPENING_DATE,
      currency,
      colour: s.colour,
      icon: s.icon,
      sortKey: accountKeys[i]!,
      groupId: s.groupId,
      includeInNetWorth: s.includeInNetWorth ?? true,
      notes: s.notes ?? null,
      creditLimitMinor: s.creditLimit ?? null,
      state: s.state ?? "active",
    })),
  };
}
