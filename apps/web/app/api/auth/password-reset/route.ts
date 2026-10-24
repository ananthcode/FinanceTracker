import { createClient } from "@supabase/supabase-js";
import { PasswordResetRequest } from "@ft/core";
import { route } from "@/lib/api/handler";
import { audit } from "@/lib/audit";
import { publicEnv } from "@/lib/env";
import { serverEnv } from "@/lib/env.server";
import { hitRateLimit, sha256Hex } from "@/lib/rate-limit";

const NEUTRAL = {
  message: "If an account exists for that email, we've sent a link to reset the password. It is valid for 1 hour.",
};

/**
 * POST /api/auth/password-reset — always 202 with the same neutral message (FR-008); at most
 * 3 reset emails per address per hour (FR-008a). The link is single-use and valid for 1 hour.
 */
export const POST = route(
  { auth: "none", name: "/api/auth/password-reset", body: PasswordResetRequest },
  async ({ body, client }) => {
    if (await hitRateLimit("reset", body.email, 3600, 3)) {
      const anon = createClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      // Supabase sends nothing for unknown emails; the response is identical either way.
      await anon.auth.resetPasswordForEmail(body.email, {
        redirectTo: `${new URL(serverEnv().webBaseUrl).origin}/reset-password`,
      });
      await audit("password_reset_requested", {
        targetType: "session",
        device: client,
        details: { emailRef: sha256Hex(body.email) }, // not "…hash": the audit redactor strips such keys
      });
    }
    return Response.json(NEUTRAL, { status: 202 });
  },
);
