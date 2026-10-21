import { CreateInvitationRequest } from "@ft/core";
import { route } from "@/lib/api/handler";
import { createInvitation } from "@/lib/invitations";

/** POST /api/admin/invitations — owner-admin invites a person by email (US1, FR-002). */
export const POST = route(
  { auth: "owner", name: "/api/admin/invitations", body: CreateInvitationRequest },
  async ({ body, user }) => {
    const created = await createInvitation(body.email, { id: user!.id, email: user!.email });
    // The token is never returned — it exists only in the emailed link (FR-003a).
    return Response.json(created, { status: 201 });
  },
);
