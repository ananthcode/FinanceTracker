import { z } from "zod";
import { Change, DEFAULT_PREFERENCES, demoChanges, todayInZone } from "@ft/core";
import { getPreferences, hasNoData, loadDemoData, resetAndLoadDemo, resetMyData } from "@ft/db";
import { ApiError, errors } from "@/lib/api/errors";
import { route } from "@/lib/api/handler";
import { removeAllFilesOf, removeFilesOf, storeDemoFiles } from "@/lib/attachments-server";
import { publicEnv } from "@/lib/env";
import { hitRateLimit } from "@/lib/rate-limit";

/**
 * The user's own data as a whole (R5, specs/005-demo-data/contracts/http-api.md): what can be done
 * (GET), and load the demo household, reset, or both (POST). Loading is for the demo environment only
 * (research R5-04). Nothing about records is logged.
 * R9 (research R9-03): a reset also removes the user's attachment files; a demo load stores the demo
 * receipt's file first (and removes it again if the load fails).
 */
/** Whole-household work: up to 60 s on Vercel (the Hobby default is 10 s). */
export const maxDuration = 60;

const demoAvailable = () => publicEnv.appEnv === "demo";

const DataRequest = z
  .object({ action: z.enum(["load", "reset", "reset_and_load"]), confirm: z.literal("RESET").optional() })
  .strict();

export const GET = route({ auth: "user", name: "/api/me/data" }, async ({ supabase }) =>
  Response.json({ empty: await hasNoData(supabase!), demoAvailable: demoAvailable() }),
);

export const POST = route({ auth: "user", name: "/api/me/data", body: DataRequest }, async ({ body, user, supabase, client }) => {
  if (!(await hitRateLimit("data-action", user!.id, 60, 10))) throw errors.tryLater();
  const db = supabase!;
  if (body.action !== "reset" && !demoAvailable()) {
    throw new ApiError(403, "NOT_AVAILABLE", "Demo data can only be loaded in the demo environment.");
  }
  if (body.action !== "load" && body.confirm !== "RESET") {
    throw errors.validation('Type RESET to confirm.');
  }

  // The household for today in the user's timezone, as the same validated changes a push would send.
  const demo = async () => {
    const prefs = await getPreferences(db, user!.id);
    const today = todayInZone((prefs ?? DEFAULT_PREFERENCES).timezone);
    return { today, changes: demoChanges(today).map((c) => Change.parse(c)) };
  };
  // Files left behind by a failed removal are no one's: the user's next clean-up removes them.
  const removeFiles = (keep: string[] = []) => removeAllFilesOf(user!.id, keep).catch(() => 0);

  let stored: string[] = [];
  try {
    switch (body.action) {
      case "load": {
        const { today, changes } = await demo();
        stored = await storeDemoFiles(user!.id, changes, today);
        return Response.json({ action: "load", ...(await loadDemoData(db, changes, client)) });
      }
      case "reset": {
        const result = await resetMyData(db, client);
        await removeFiles();
        return Response.json({ action: "reset", ...result });
      }
      case "reset_and_load": {
        const { today, changes } = await demo();
        stored = await storeDemoFiles(user!.id, changes, today);
        const result = await resetAndLoadDemo(db, changes, client);
        await removeFiles(stored);
        return Response.json({ action: "reset_and_load", ...result });
      }
    }
  } catch (err) {
    await removeFilesOf(user!.id, stored).catch(() => undefined);
    const code = err instanceof Error ? err.message : "";
    if (code === "NOT_EMPTY") throw new ApiError(409, "NOT_EMPTY", "Demo data loads only into empty data. Reset first.");
    if (code === "USER_INACTIVE") throw errors.inactive();
    throw err;
  }
});
