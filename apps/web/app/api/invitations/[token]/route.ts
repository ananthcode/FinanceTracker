import { route } from "@/lib/api/handler";
import { errors } from "@/lib/api/errors";
import { lookupInvitation } from "@/lib/invitations";
import { hitRateLimit } from "@/lib/rate-limit";

/**
 * GET /api/invitations/{token} — invitation status + masked email for the invitee (US1).
 * Limited to 20 look-ups per minute per client address (FR-008a).
 */
export const GET = route<undefined, { token: string }>(
  { auth: "none", name: "/api/invitations/[token]" },
  async ({ params, clientAddress }) => {
    if (!(await hitRateLimit("invite-lookup", clientAddress, 60, 20))) throw errors.tryLater();
    return Response.json(await lookupInvitation(params.token));
  },
);
