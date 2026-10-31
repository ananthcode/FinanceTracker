/**
 * The phone app's colours (docs/ANDROID-HOME.md): bright and easy to read, with colour never the
 * only cue (Principle XIII). Income is green, expense charcoal, actions purple, plans amber.
 */
export const colours = {
  page: "#F7F7FB",
  card: "#FFFFFF",
  line: "#E5E4DD",
  text: "#1B1A2E",
  muted: "#5F5E5A",
  faint: "#888780",
  action: "#534AB7",
  actionLight: "#7F77DD",
  actionTint: "#EEEDFE",
  actionInk: "#3C3489",
  income: "#1D9E75",
  incomeLight: "#5DCAA5",
  incomeInk: "#0F6E56",
  expense: "#2C2C2A",
  expenseLight: "#5F5E5A",
  plan: "#BA7517",
  planLight: "#EF9F27",
  danger: "#A32D2D",
} as const;

/** Pastel tile colours for the menu, one per destination. */
export const tiles = {
  purple: { bg: "#EEEDFE", ink: "#3C3489" },
  coral: { bg: "#FAECE7", ink: "#712B13" },
  teal: { bg: "#E1F5EE", ink: "#085041" },
  pink: { bg: "#FBEAF0", ink: "#72243E" },
  amber: { bg: "#FAEEDA", ink: "#633806" },
  blue: { bg: "#E6F1FB", ink: "#0C447C" },
} as const;
