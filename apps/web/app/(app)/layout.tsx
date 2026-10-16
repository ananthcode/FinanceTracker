import { redirect } from "next/navigation";
import { DisplayProvider } from "@/components/providers/DisplayProvider";
import { checkEnvironment } from "@/lib/environment-guard";
import { publicEnv } from "@/lib/env";

/**
 * Signed-in frame (T037). The full navigation shell arrives with US5 (T100); this layout already
 * enforces the environment guard (FR-019a) and provides display settings to every screen.
 */
export default async function SignedInLayout({ children }: { children: React.ReactNode }) {
  const env = await checkEnvironment();
  if (env === "mismatch") redirect("/config-error");
  if (env === "unavailable") redirect("/unavailable");

  return (
    <DisplayProvider>
      <div className="flex min-h-full flex-1 flex-col">
        {publicEnv.appEnv === "demo" && (
          <div role="status" className="bg-demo px-4 py-1 text-center text-xs font-medium text-white">
            Demo environment — synthetic data only
          </div>
        )}
        <main className="mx-auto w-full max-w-5xl flex-1 p-4">{children}</main>
      </div>
    </DisplayProvider>
  );
}
