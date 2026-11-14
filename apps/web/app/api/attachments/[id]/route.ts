import { ATTACHMENTS_BUCKET, attachmentPath } from "@ft/db";
import { errors } from "@/lib/api/errors";
import { route } from "@/lib/api/handler";

/**
 * GET /api/attachments/:id — opens one of the caller's attachments: a redirect to a link that works for
 * 120 seconds (FR-003). `?download=1` saves it under its name. Another user's id is simply not found.
 */
export const GET = route<undefined, { id: string }>({ auth: "user", name: "/api/attachments/:id" }, async ({ request, params, user, supabase }) => {
  const db = supabase!;
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) throw errors.notFound();
  const { data, error } = await db.from("attachments").select("id, name").eq("id", params.id).eq("state", "active").maybeSingle();
  if (error) throw new Error("ATTACHMENTS_READ_FAILED");
  if (!data) throw errors.notFound();
  const download = new URL(request.url).searchParams.get("download") === "1";
  const { data: signed, error: signError } = await db.storage
    .from(ATTACHMENTS_BUCKET)
    .createSignedUrl(attachmentPath(user!.id, params.id), 120, download ? { download: (data as { name: string }).name } : undefined);
  if (signError || !signed) throw errors.notFound();
  return new Response(null, { status: 302, headers: { location: signed.signedUrl, "cache-control": "private, no-store" } });
});
