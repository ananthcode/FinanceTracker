import { ChangeResult, PullResponse } from "@ft/core";
import { api } from "../api";
import type { PushInput, SyncTransport } from "./types";

/** The real transport: the web server's sync API with the user's bearer token (contracts/http-api.md). */
export const apiTransport: SyncTransport = {
  async push(request: PushInput) {
    const body = await api<{ results: unknown }>("/api/sync/push", { body: request });
    return ChangeResult.array().parse(body.results);
  },
  async pull(cursor: string) {
    return PullResponse.parse(await api<unknown>(`/api/sync/pull?cursor=${encodeURIComponent(cursor)}`));
  },
};
