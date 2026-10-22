import { z } from "zod";
import { EraseUserRequest } from "@ft/core";
import { route } from "@/lib/api/handler";
import { errors } from "@/lib/api/errors";
import { eraseUser } from "@/lib/admin";

/** POST /api/admin/users/{id}/erase — permanent erasure after typing the email (FR-016a). */
export const POST = route<typeof EraseUserRequest, { id: string }>(
  { auth: "owner", name: "/api/admin/users/[id]/erase", body: EraseUserRequest },
  async ({ params, body, user }) => {
    if (!z.uuid().safeParse(params.id).success) throw errors.notFound();
    await eraseUser(params.id, body.confirmEmail, { id: user!.id, email: user!.email });
    return new Response(null, { status: 204 });
  },
);
