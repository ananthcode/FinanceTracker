import { z } from "zod";
import { route } from "@/lib/api/handler";
import { errors } from "@/lib/api/errors";
import { revokeInvitation } from "@/lib/admin";

/** POST /api/admin/invitations/{id}/revoke — the link stops working immediately (US4). */
export const POST = route<undefined, { id: string }>(
  { auth: "owner", name: "/api/admin/invitations/[id]/revoke" },
  async ({ params, user }) => {
    if (!z.uuid().safeParse(params.id).success) throw errors.notFound();
    await revokeInvitation(params.id, { id: user!.id, email: user!.email });
    return new Response(null, { status: 204 });
  },
);
