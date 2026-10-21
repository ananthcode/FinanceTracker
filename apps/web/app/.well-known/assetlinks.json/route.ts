import { serverEnv } from "@/lib/env.server";

/**
 * Android App Links verification (FR-004a, research R-03): lets invitation links open directly in
 * this environment's Android app. Values come from configuration, never source.
 */
export function GET() {
  const env = serverEnv();
  return Response.json([
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: env.androidAppId,
        sha256_cert_fingerprints: [env.androidCertSha256],
      },
    },
  ]);
}
