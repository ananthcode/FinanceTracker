import { runInterestProposals } from "@ft/db";
import { errors } from "@/lib/api/errors";
import { route } from "@/lib/api/handler";
import { hitRateLimit } from "@/lib/rate-limit";

/**
 * POST /api/interest/propose — proposes the caller's automatic interest for every month that has
 * ended (R4 FR-014, contracts/http-api.md). The server decides "today"; nothing about people or
 * amounts is logged. Android calls it when it opens; the web layout calls the repository directly.
 */
export const POST = route({ auth: "user", name: "/api/interest/propose" }, async ({ user, supabase }) => {
  if (!(await hitRateLimit("interest-propose", user!.id, 60, 30))) throw errors.tryLater();
  try {
    return Response.json({ changed: await runInterestProposals(supabase!) });
  } catch (err) {
    if (err instanceof Error && err.message === "USER_INACTIVE") throw errors.inactive();
    throw err;
  }
});
