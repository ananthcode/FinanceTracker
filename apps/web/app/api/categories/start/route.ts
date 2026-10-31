import { z } from "zod";
import { CategoriesStartSchema } from "@ft/core";
import { startCategories } from "@ft/db";
import { errors } from "@/lib/api/errors";
import { route } from "@/lib/api/handler";
import { hitRateLimit } from "@/lib/rate-limit";

const StartRequest = z.object({ choice: CategoriesStartSchema }).strict();

/**
 * POST /api/categories/start — the one-time "suggested / empty" choice for the default categories
 * (R3 FR-007, contracts/http-api.md). Returns the stored first answer, which may differ from this
 * request when another device answered first, and how many categories were added. The default list
 * comes from packages/core, never from the request. Nothing about the categories is logged.
 */
export const POST = route({ auth: "user", name: "/api/categories/start", body: StartRequest }, async ({ body, user, supabase, client }) => {
  if (!(await hitRateLimit("categories-start", user!.id, 60, 10))) throw errors.tryLater();
  try {
    return Response.json(await startCategories(supabase!, body.choice, client));
  } catch (err) {
    if (err instanceof Error && err.message === "USER_INACTIVE") throw errors.inactive();
    throw err;
  }
});
