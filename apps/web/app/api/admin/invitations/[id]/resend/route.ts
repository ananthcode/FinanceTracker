import { z } from "zod";
import { route } from "@/lib/api/handler";
import { errors } from "@/lib/api/errors";
import { resendInvitation } from "@/lib/invitations";

/** POST /api/admin/invitations/{id}/resend — new link, fresh 7-day expiry; old link stops working (FR-003). */
export const POST = route<undefined, { id: string }>(
  { auth: "owner", name: "/api/admin/invitations/[id]/resend" },
  async ({ params, user }) => {
    if (!z.uuid().safeParse(params.id).success) throw errors.notFound();
    const created = await resendInvitation(params.id, { id: user!.id, email: user!.email });
    return Response.json(created, { status: 201 });
  },
);
