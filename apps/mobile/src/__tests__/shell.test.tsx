import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { Text } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { HeaderActions } from "@/components/HeaderActions";
import { StatusFrame } from "@/components/StatusFrame";
import { OFFLINE_DEBOUNCE_MS } from "@/lib/connectivity";

/** T099 — User Story 5 on Android: Offline banner (FR-036), Demo marker (FR-035), owner-only entry (FR-034). */

type Listener = (state: { isConnected: boolean | null; isInternetReachable: boolean | null }) => void;
let emitNetInfo: Listener = () => undefined;

jest.mock("@react-native-community/netinfo", () => ({
  __esModule: true,
  default: {
    addEventListener: (listener: Listener) => {
      emitNetInfo = listener;
      return () => undefined;
    },
  },
}));

const mockPush = jest.fn();
jest.mock("expo-router", () => ({ router: { push: (href: string) => mockPush(href) } }));
jest.mock("expo-symbols", () => ({ SymbolView: () => null }));
// The real health check needs app configuration; tests pass their own.
jest.mock("@/lib/service-status", () => {
  const actual = jest.requireActual("@/lib/service-status");
  return { ...actual, checkService: async () => true };
});

const ONLINE = { isConnected: true, isInternetReachable: true };
const OFFLINE = { isConnected: false, isInternetReachable: false };

async function renderFrame(props: { demo?: boolean; check?: () => Promise<boolean> } = {}) {
  return await render(
    <SafeAreaProvider
      initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 24, left: 0, right: 0, bottom: 0 } }}
    >
      <StatusFrame demo={props.demo ?? false} check={props.check ?? (async () => true)}>
        <Text>screen</Text>
      </StatusFrame>
    </SafeAreaProvider>,
  );
}

async function emit(state: typeof ONLINE) {
  await act(async () => emitNetInfo(state));
}

async function advance(ms: number) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
}

beforeEach(() => {
  jest.useFakeTimers();
  mockPush.mockClear();
});

afterEach(() => {
  jest.useRealTimers();
});

describe("Offline banner (FR-036, quickstart S5-b)", () => {
  it("appears 2 s after connectivity is lost — inside the 5 s limit — and goes when it returns", async () => {
    await renderFrame();
    await emit(ONLINE);
    expect(screen.queryByTestId("offline-banner")).toBeNull();

    await emit(OFFLINE);
    await advance(OFFLINE_DEBOUNCE_MS - 1);
    expect(screen.queryByTestId("offline-banner")).toBeNull(); // brief drops do not flash it
    await advance(1);
    expect(screen.getByTestId("offline-banner")).toBeTruthy();
    expect(OFFLINE_DEBOUNCE_MS).toBeLessThanOrEqual(5000);

    await emit(ONLINE);
    await advance(OFFLINE_DEBOUNCE_MS);
    expect(screen.queryByTestId("offline-banner")).toBeNull();
  });

  it("ignores a drop shorter than the debounce", async () => {
    await renderFrame();
    await emit(ONLINE);
    await emit(OFFLINE);
    await advance(1000);
    await emit(ONLINE);
    await advance(OFFLINE_DEBOUNCE_MS * 2);
    expect(screen.queryByTestId("offline-banner")).toBeNull();
  });

  it("shows at once when the app starts offline, without reporting the service as down", async () => {
    const check = jest.fn(async () => false);
    await renderFrame({ check });
    await emit(OFFLINE);
    expect(screen.getByTestId("offline-banner")).toBeTruthy();
    expect(screen.queryByTestId("service-unavailable")).toBeNull();
    expect(check).not.toHaveBeenCalled();
  });

  it("treats a network Android reports as having no internet as offline", async () => {
    await renderFrame();
    await emit({ isConnected: true, isInternetReachable: false });
    expect(screen.getByTestId("offline-banner")).toBeTruthy();
  });
});

describe("Demo marker (FR-035)", () => {
  it("is shown in the demo environment", async () => {
    await renderFrame({ demo: true });
    await emit(ONLINE);
    expect(screen.getByTestId("demo-badge")).toBeTruthy();
    expect(screen.getByText(/synthetic data only/)).toBeTruthy();
  });

  it("is absent in the live environment", async () => {
    await renderFrame({ demo: false });
    await emit(ONLINE);
    expect(screen.queryByTestId("demo-badge")).toBeNull();
  });
});

describe("Service temporarily unavailable (T104)", () => {
  it("is shown when online but the backend does not answer, and clears on a successful retry", async () => {
    let up = false;
    await renderFrame({ check: async () => up });
    await emit(ONLINE);
    expect(screen.getByTestId("service-unavailable")).toBeTruthy();
    expect(screen.getByText("screen")).toBeTruthy(); // the app keeps working underneath

    up = true;
    await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
    expect(screen.queryByTestId("service-unavailable")).toBeNull();
  });
});

describe("User management entry (FR-034, US5 scenario 4)", () => {
  it("is shown to the owner-admin and opens user management", async () => {
    await render(<HeaderActions isOwner />);
    await fireEvent.press(screen.getByRole("button", { name: "User management" }));
    expect(mockPush).toHaveBeenCalledWith("/admin");
  });

  it("is absent for members", async () => {
    await render(<HeaderActions isOwner={false} />);
    expect(screen.queryByTestId("admin-entry")).toBeNull();
  });
});
