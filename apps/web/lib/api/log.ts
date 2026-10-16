/**
 * Redacting logger (FR-036d): application logs carry an error reference, the route and the error
 * class only — never emails, tokens, passwords, PINs or amounts.
 */
export interface LogEntry {
  errorId: string;
  route: string;
  errorClass: string;
  status?: number;
}

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const LONG_TOKEN = /[A-Za-z0-9_-]{24,}/g;

/** Defensive scrub for any free text that reaches a log line. */
export function scrub(text: string): string {
  return text.replace(EMAIL, "[email]").replace(LONG_TOKEN, "[token]");
}

export type LogSink = (line: string) => void;
let sink: LogSink = (line) => console.error(line);

/** Test hook. */
export function setLogSink(next: LogSink): void {
  sink = next;
}

export function logError(entry: LogEntry): void {
  sink(
    JSON.stringify({
      level: "error",
      errorId: entry.errorId,
      route: scrub(entry.route),
      errorClass: scrub(entry.errorClass),
      status: entry.status,
    }),
  );
}
