/**
 * Hybrid logical clock (contracts/sync-protocol.md §HLC, research R2-02).
 *
 * Text form `wallMillis.counter.deviceId` with a 13-digit wall time and a 4-digit counter, so
 * comparing two HLC strings byte-wise gives the same order as comparing their parts — the
 * database compares them as text.
 */

export interface HlcParts {
  wall: number;
  counter: number;
  device: string;
}

/** A future clock is trusted at most this far ahead of the server's receive time. */
export const CLOCK_SKEW_LIMIT_MS = 300_000;

const MAX_COUNTER = 9999;
export const HLC_PATTERN = /^(\d{13})\.(\d{4})\.([a-z0-9]{8,32})$/;
export const DEVICE_ID_PATTERN = /^[a-z0-9]{8,32}$/;

export function formatHlc(p: HlcParts): string {
  return `${String(p.wall).padStart(13, "0")}.${String(p.counter).padStart(4, "0")}.${p.device}`;
}

export function parseHlc(text: string): HlcParts {
  const m = HLC_PATTERN.exec(text);
  if (!m) throw new Error("INVALID_HLC");
  return { wall: Number(m[1]), counter: Number(m[2]), device: m[3]! };
}

/** -1, 0 or 1. Byte-wise comparison is exact because the numeric parts are fixed-width. */
export function compareHlc(a: string, b: string): -1 | 0 | 1 {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** The HLC for a new local change at wall time `now`. */
export function nextHlc(last: HlcParts | null, now: number, device: string): HlcParts {
  const wall = Math.max(now, last?.wall ?? 0);
  if (last && wall === last.wall) {
    if (last.counter < MAX_COUNTER) return { wall, counter: last.counter + 1, device };
    return { wall: wall + 1, counter: 0, device };
  }
  return { wall, counter: 0, device };
}

/** Advances the local clock past an HLC seen from elsewhere (after a pull). */
export function observeHlc(last: HlcParts | null, seen: HlcParts): HlcParts {
  const device = last?.device ?? seen.device;
  if (!last || seen.wall > last.wall || (seen.wall === last.wall && seen.counter > last.counter)) {
    return { wall: seen.wall, counter: seen.counter, device };
  }
  return last;
}

/** Caps the wall time at `receivedAt + CLOCK_SKEW_LIMIT_MS` (a phone with a future clock cannot win forever). */
export function clampHlc(hlc: string, receivedAt: number): { hlc: string; clamped: boolean } {
  const p = parseHlc(hlc);
  const limit = receivedAt + CLOCK_SKEW_LIMIT_MS;
  if (p.wall <= limit) return { hlc, clamped: false };
  return { hlc: formatHlc({ ...p, wall: limit }), clamped: true };
}
