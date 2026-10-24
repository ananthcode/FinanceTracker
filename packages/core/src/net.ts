/** Local development hosts that may use plain HTTP (10.0.2.2 = host machine from the Android emulator). */
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "10.0.2.2", "[::1]"]);

/** FR-036a: backend URLs must be https:// — plain http only for local development hosts. */
export function isSecureOrLocalUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || (url.protocol === "http:" && LOCAL_HOSTS.has(url.hostname));
  } catch {
    return false;
  }
}
