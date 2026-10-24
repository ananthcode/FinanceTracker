/**
 * Minimal client for the local Mailpit inbox bundled with the Supabase CLI stack.
 * Used by E2E tests to read invitation and password-reset emails (synthetic addresses only).
 */
const MAILPIT_URL = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";

interface MailpitSummary {
  ID: string;
  Created: string;
  Subject: string;
}

interface MailpitMessage {
  ID: string;
  Subject: string;
  Text: string;
  HTML: string;
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${MAILPIT_URL}${path}`);
  if (!res.ok) throw new Error(`Mailpit ${path} failed with ${res.status}`);
  return (await res.json()) as T;
}

/** Latest message sent to `address`, waiting up to `timeoutMs` for it to arrive. */
export async function latestEmailTo(
  address: string,
  { timeoutMs = 10_000, since }: { timeoutMs?: number; since?: Date } = {},
): Promise<MailpitMessage> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const query = encodeURIComponent(`to:"${address}"`);
    const result = await getJson<{ messages: MailpitSummary[] }>(`/api/v1/search?query=${query}`);
    const fresh = result.messages.filter((m) => !since || new Date(m.Created) >= since);
    const first = fresh[0];
    if (first) return getJson<MailpitMessage>(`/api/v1/message/${first.ID}`);
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`No email for ${address} within ${timeoutMs} ms`);
}

/** Number of messages sent to `address` (optionally since a point in time). */
export async function countEmailsTo(address: string, since?: Date): Promise<number> {
  const query = encodeURIComponent(`to:"${address}"`);
  const result = await getJson<{ messages: MailpitSummary[] }>(`/api/v1/search?query=${query}`);
  return result.messages.filter((m) => !since || new Date(m.Created) >= since).length;
}

/** First URL in the message body that starts with `prefix`. */
export function extractLink(message: MailpitMessage, prefix: string): string {
  const text = `${message.Text}\n${message.HTML}`;
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = text.match(new RegExp(`${escaped}[^\\s"'<>]+`));
  if (!match) throw new Error(`No link starting with ${prefix} in "${message.Subject}"`);
  return match[0].replace(/&amp;/g, "&");
}

export async function clearInbox(): Promise<void> {
  await fetch(`${MAILPIT_URL}/api/v1/messages`, { method: "DELETE" });
}
