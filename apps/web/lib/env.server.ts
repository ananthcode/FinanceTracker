import "server-only";
import { z } from "zod";
import { isSecureOrLocalUrl } from "./env";

const ServerEnv = z.object({
  serviceRoleKey: z.string().min(1),
  webBaseUrl: z.string().refine(isSecureOrLocalUrl, "WEB_BASE_URL must be https:// outside local development"),
  smtpHost: z.string().min(1),
  smtpPort: z.coerce.number().int().positive(),
  smtpUser: z.string().optional(),
  smtpPass: z.string().optional(),
  smtpFrom: z.string().min(1),
  androidAppId: z.string().min(1),
  androidCertSha256: z.string().min(1),
  idleMinutes: z.coerce.number().int().positive().default(30),
});

export type ServerEnv = z.infer<typeof ServerEnv>;

let cached: ServerEnv | undefined;

/** Server-only configuration (service-role key, SMTP). Never import from client components. */
export function serverEnv(): ServerEnv {
  cached ??= ServerEnv.parse({
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    webBaseUrl: process.env.WEB_BASE_URL,
    smtpHost: process.env.SMTP_HOST,
    smtpPort: process.env.SMTP_PORT,
    smtpUser: process.env.SMTP_USER || undefined,
    smtpPass: process.env.SMTP_PASS || undefined,
    smtpFrom: process.env.SMTP_FROM,
    androidAppId: process.env.ANDROID_APP_ID,
    androidCertSha256: process.env.ANDROID_CERT_SHA256,
    idleMinutes: process.env.IDLE_MINUTES || undefined,
  });
  return cached;
}
