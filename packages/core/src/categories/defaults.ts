/**
 * The suggested default categories for an Indian household (spec "Default categories", FR-007).
 * Added once, by app.start_categories, when the user chooses them. A child takes its parent's
 * colour; icons are per category.
 */
import type { AccountColour } from "../accounts/appearance";
import type { AppearanceIcon } from "../appearance/icons";
import type { CategoryKind } from "./types";

export interface DefaultCategory {
  name: string;
  kind: CategoryKind;
  colour: AccountColour;
  icon: AppearanceIcon;
  children: { name: string; icon: AppearanceIcon }[];
}

const expense = (name: string, colour: AccountColour, icon: AppearanceIcon, children: [string, AppearanceIcon][] = []): DefaultCategory => ({
  name,
  kind: "expense",
  colour,
  icon,
  children: children.map(([child, childIcon]) => ({ name: child, icon: childIcon })),
});

const income = (name: string, colour: AccountColour, icon: AppearanceIcon, children: [string, AppearanceIcon][] = []): DefaultCategory => ({
  ...expense(name, colour, icon, children),
  kind: "income",
});

export const DEFAULT_CATEGORIES: readonly DefaultCategory[] = [
  expense("Food & groceries", "green", "shopping-cart", [
    ["Groceries", "shopping-cart"],
    ["Vegetables & fruits", "shopping-bag"],
    ["Milk & dairy", "shopping-cart"],
    ["Eating out", "utensils"],
    ["Food delivery", "package"],
  ]),
  expense("Home", "brown", "home", [
    ["Rent", "home"],
    ["Maintenance & society charges", "building"],
    ["Repairs", "wrench"],
    ["Furnishing", "bed"],
    ["Domestic help", "users"],
  ]),
  expense("Utilities & bills", "amber", "zap", [
    ["Electricity", "zap"],
    ["Water", "droplet"],
    ["Cooking gas", "flame"],
    ["Mobile", "smartphone"],
    ["Internet & broadband", "wifi"],
    ["DTH & streaming", "tv"],
  ]),
  expense("Transport", "blue", "car", [
    ["Fuel", "fuel"],
    ["Cab & auto", "car"],
    ["Public transport", "bus"],
    ["Vehicle service", "wrench"],
    ["Tolls & parking", "ticket"],
  ]),
  expense("Health", "red", "stethoscope", [
    ["Doctor & hospital", "stethoscope"],
    ["Medicines", "pill"],
    ["Tests & diagnostics", "stethoscope"],
  ]),
  expense("Education", "indigo", "graduation-cap", [
    ["School & college fees", "graduation-cap"],
    ["Tuition & classes", "book"],
    ["Books & supplies", "book"],
  ]),
  expense("Shopping", "pink", "shopping-bag", [
    ["Clothing & footwear", "shirt"],
    ["Electronics", "laptop"],
    ["Household items", "home"],
    ["Personal care", "sparkles"],
  ]),
  expense("Family & social", "purple", "users", [
    ["Gifts given", "gift"],
    ["Festivals & celebrations", "party-popper"],
    ["Donations", "hand-heart"],
    ["Pets", "paw-print"],
  ]),
  expense("Entertainment", "orange", "film", [
    ["Movies & events", "ticket"],
    ["Hobbies", "star"],
    ["Subscriptions", "tv"],
  ]),
  expense("Travel", "teal", "plane", [
    ["Tickets", "ticket"],
    ["Stays", "bed"],
    ["Holiday spending", "globe"],
  ]),
  expense("Insurance", "slate", "shield", [
    ["Life insurance", "heart"],
    ["Health insurance", "stethoscope"],
    ["Vehicle insurance", "car"],
  ]),
  expense("Taxes & charges", "slate", "scale", [
    ["Income tax", "receipt"],
    ["Property tax", "receipt"],
    ["Bank charges", "bank"],
    ["Fines & penalties", "receipt"],
  ]),
  expense("Interest paid", "red", "percent", [
    ["Loan interest", "percent"],
    ["Card interest & fees", "credit-card"],
  ]),
  expense("Miscellaneous", "slate", "package"),
  income("Salary", "green", "briefcase", [
    ["Salary", "briefcase"],
    ["Bonus", "star"],
  ]),
  income("Business & freelance", "teal", "laptop"),
  income("Interest received", "blue", "percent"),
  income("Dividends", "indigo", "piggy-bank"),
  income("Rent received", "brown", "home"),
  income("Gifts received", "purple", "gift"),
  income("Refunds & cashback", "olive", "receipt"),
  income("Other income", "slate", "coins"),
];

/** How many categories the defaults add (parents and children). */
export const DEFAULT_CATEGORY_COUNT = DEFAULT_CATEGORIES.reduce((n, c) => n + 1 + c.children.length, 0);
