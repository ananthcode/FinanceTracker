import { ForgotForm } from "./ForgotForm";

/** /forgot-password — request a reset link (FR-008, FR-008a). */
export default async function ForgotPasswordPage({ searchParams }: PageProps<"/forgot-password">) {
  const params = await searchParams;
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 p-6">
      <h1 className="text-2xl font-semibold">Reset your password</h1>
      {params.error === "link" && (
        <p role="status" className="rounded-md border border-border p-3 text-sm">
          That reset link is invalid or has expired. Request a new one below.
        </p>
      )}
      <ForgotForm />
    </main>
  );
}
