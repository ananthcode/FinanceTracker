/**
 * FR-036e: shown on every joining path before access is created. Same wording as the Android
 * PrivacyNotice component.
 */
export function PrivacyNotice() {
  return (
    <section aria-labelledby="privacy-title" className="rounded-md border border-border p-3 text-sm">
      <h2 id="privacy-title" className="mb-1 font-medium">
        Before you join
      </h2>
      <ul className="list-disc space-y-1 pl-5">
        <li>We store your name, email, sign-in times and the financial records you enter.</li>
        <li>
          The owner of this app can see your name, email, whether your access is active and when you last
          signed in — never your financial data.
        </li>
        <li>You can ask the owner to permanently erase you and all your data at any time.</li>
      </ul>
    </section>
  );
}
