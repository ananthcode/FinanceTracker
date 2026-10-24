import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { z } from "zod";
import { createBearerClient } from "@ft/db";
import { publicEnv } from "@/lib/env";
import { serverEnv } from "@/lib/env.server";
import { adminSupabase } from "@/lib/supabase/admin";
import { createServerSupabase } from "@/lib/supabase/server";
import { ApiError, errorResponse, errors, newErrorId } from "./errors";
import { logError } from "./log";

export type AuthMode = "none" | "user" | "owner";

export interface CurrentUser {
  id: string;
  email: string;
  role: "owner" | "member";
  setupComplete: boolean;
}

export interface RouteContext<TBody, TParams> {
  request: Request;
  body: TBody;
  params: TParams;
  /** Present when auth is "user" or "owner". */
  user: CurrentUser | null;
  /** Supabase client acting as the caller (RLS applies). */
  supabase: SupabaseClient | null;
  /** "android" when the request authenticates with a bearer token, otherwise "web". */
  client: "web" | "android";
  bearerToken: string | null;
  clientAddress: string;
}

interface RouteOptions<TSchema extends z.ZodType | undefined> {
  auth: AuthMode;
  body?: TSchema;
  /** Route label used in logs. */
  name: string;
}

type BodyOf<TSchema> = TSchema extends z.ZodType ? z.output<TSchema> : undefined;

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * CSRF protection (FR-036b): browsers always send `Origin` on state-changing requests, and it must
 * be this site. Requests without `Origin` must declare `X-FT-Client: android`, a custom header a
 * cross-site browser request cannot send without a CORS preflight (which we never allow).
 */
export function checkOrigin(request: Request, webBaseUrl: string): boolean {
  if (!MUTATING.has(request.method)) return true;
  const origin = request.headers.get("origin");
  if (origin) return origin === new URL(webBaseUrl).origin;
  return request.headers.get("x-ft-client") === "android";
}

function readBearer(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  return token.length > 0 ? token : null;
}

export function clientAddressOf(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}

async function resolveUser(
  request: Request,
  bearer: string | null,
): Promise<{ user: CurrentUser; supabase: SupabaseClient } | null> {
  // No bearer token and no cookies at all: nothing to authenticate with.
  if (!bearer && !request.headers.get("cookie")) return null;
  const config = { url: publicEnv.supabaseUrl, anonKey: publicEnv.supabaseAnonKey };
  const supabase = bearer ? createBearerClient(config, bearer) : await createServerSupabase();
  const { data, error } = bearer ? await supabase.auth.getUser(bearer) : await supabase.auth.getUser();
  if (error || !data.user) return null;

  // Status/role come from the server side, never from the client (FR-015, FR-016).
  const { data: profile } = await adminSupabase()
    .from("profiles")
    .select("user_id, email, role, status, setup_completed_at")
    .eq("user_id", data.user.id)
    .maybeSingle();
  if (!profile) return null; // erased or never set up → treated as unauthenticated
  if (profile.status !== "active") throw errors.inactive();

  return {
    supabase,
    user: {
      id: profile.user_id as string,
      email: profile.email as string,
      role: profile.role as "owner" | "member",
      setupComplete: profile.setup_completed_at !== null,
    },
  };
}

/** Wraps a route handler with validation, auth, CSRF checks and the contract error shape. */
export function route<TSchema extends z.ZodType | undefined, TParams = Record<string, string>>(
  options: RouteOptions<TSchema>,
  handler: (ctx: RouteContext<BodyOf<TSchema>, TParams>) => Promise<Response>,
) {
  return async (request: Request, segment?: { params: Promise<TParams> }): Promise<Response> => {
    const errorId = newErrorId();
    try {
      if (!checkOrigin(request, serverEnv().webBaseUrl)) throw errors.forbidden();

      const bearerToken = readBearer(request);
      let user: CurrentUser | null = null;
      let supabase: SupabaseClient | null = null;
      if (options.auth !== "none") {
        const resolved = await resolveUser(request, bearerToken);
        if (!resolved) throw errors.unauthenticated();
        if (options.auth === "owner" && resolved.user.role !== "owner") throw errors.forbidden();
        ({ user, supabase } = resolved);
      }

      let body = undefined as BodyOf<TSchema>;
      if (options.body) {
        const raw: unknown = await request.json().catch(() => {
          throw errors.validation("The request body must be JSON.");
        });
        const parsed = options.body.safeParse(raw);
        if (!parsed.success) throw errors.validation();
        body = parsed.data as BodyOf<TSchema>;
      }

      const params = (segment ? await segment.params : {}) as TParams;
      return await handler({
        request,
        body,
        params,
        user,
        supabase,
        client: bearerToken || request.headers.get("x-ft-client") === "android" ? "android" : "web",
        bearerToken,
        clientAddress: clientAddressOf(request),
      });
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status >= 500) logError({ errorId, route: options.name, errorClass: err.code, status: err.status });
        return errorResponse(err, errorId);
      }
      logError({
        errorId,
        route: options.name,
        errorClass: err instanceof Error ? err.name : "UnknownError",
        status: 500,
      });
      return errorResponse(new ApiError(500, "INTERNAL", "Something went wrong. Please try again."), errorId);
    }
  };
}
