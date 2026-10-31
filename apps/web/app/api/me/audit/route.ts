import { z } from "zod";
import { route } from "@/lib/api/handler";
import { audit } from "@/lib/audit";

const DeviceAuditRequest = z
  .object({ action: z.enum(["app_lock_enabled", "app_lock_disabled"]), device: z.literal("android") })
  .strict();

/**
 * POST /api/me/audit — records device-side events in the user's history (R1 T113, FR-037;
 * contracts/http-api.md). Only app lock on/off; never a PIN or any detail of it.
 */
export const POST = route({ auth: "user", name: "/api/me/audit", body: DeviceAuditRequest }, async ({ body, user }) => {
  await audit(body.action, {
    actorId: user!.id,
    actorRef: user!.email,
    targetType: "user",
    targetId: user!.id,
    device: body.device,
  });
  return new Response(null, { status: 204 });
});
