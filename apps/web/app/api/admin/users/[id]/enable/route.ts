import { z } from "zod";
import { route } from "@/lib/api/handler";
import { errors } from "@/lib/api/errors";
import { setUserAccess } from "@/lib/admin";

/** POST /api/admin/users/{id}/enable — restores access with all data intact (FR-015). */
export const POST = route<undefined, { id: string }>(
  { auth: "owner", name: "/api/admin/users/[id]/enable" },
  async ({ params, user }) => {
    if (!z.uuid().safeParse(params.id).success) throw errors.notFound();
    await setUserAccess(params.id, "active", { id: user!.id, email: user!.email });
    return new Response(null, { status: 204 });
  },
);
