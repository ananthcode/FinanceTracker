import { z } from "zod";
import { route } from "@/lib/api/handler";
import { errors } from "@/lib/api/errors";
import { setUserAccess } from "@/lib/admin";

/** POST /api/admin/users/{id}/disable — next request from any device is refused (FR-015, SC-007). */
export const POST = route<undefined, { id: string }>(
  { auth: "owner", name: "/api/admin/users/[id]/disable" },
  async ({ params, user }) => {
    if (!z.uuid().safeParse(params.id).success) throw errors.notFound();
    await setUserAccess(params.id, "disabled", { id: user!.id, email: user!.email });
    return new Response(null, { status: 204 });
  },
);
