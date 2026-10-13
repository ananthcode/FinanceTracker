# Feature Specification: Identity, Access & App Shell

**Feature Branch**: `001-identity-access-shell`

**Created**: 2026-10-11

**Status**: Approved (2026-10-11)

**Input**: User description: "Roadmap capability R1 (ROADMAP.md) — Identity, access & app shell: invite-only access managed by a single owner-admin, Google and email/password sign-in, per-user private data, first-run regional preferences, Android app lock, hide-balances mode, and the signed-in navigation shell for web and Android."

## Clarifications

### Session 2026-10-11

- Q: Should the web app sign users out automatically after inactivity? → A: Offer a "Keep me signed in" choice at web sign-in; when not ticked, the session ends after 30 minutes of inactivity or when the browser is closed.
- Q: Should the owner-admin be able to permanently delete a user and all of their data? → A: Yes — the owner-admin can permanently erase any user (except themselves) and all of that user's data, with dual confirmation (a consequences warning, then typing the user's email exactly).
- Q: Should hide-balances mode apply per device or to all of the user's devices? → A: Per device — each phone or browser has its own independent switch.
- Q: When an invitation is opened on an Android phone, where should the person complete joining? → A: In the Android app if it is installed; otherwise on a web page that also explains how to get the Android app.

### Session 2026-10-13 (security checklist review)

- Q: While app lock is on, should screenshots of the app be allowed? → A: Yes — screenshots stay allowed; only the recent-apps preview is hidden (reliable on Android 13+, best effort on older versions).
- Q: After 5 wrong PINs, what happens to offline entries not yet sent? → A: Keep them sealed on the device and upload them only after the same user signs back in on that device; all other locally stored data is removed.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Invited person joins the app (Priority: P1)

The owner-admin invites a household member or tester by email. The invited person opens the
invitation, chooses to join with their Google account or with an email and password, and lands in
their own, empty, private space in the app. Nobody can join without a valid invitation.

**Why this priority**: Without a way to get people in, nothing else in the app can be used. It is
also the main privacy control: the app must only ever contain people the owner chose.

**Independent Test**: The owner-admin invites `asha.test@example.com`; Asha accepts via email +
password and reaches the signed-in home screen; a second, uninvited person
(`ravi.test@example.com`) cannot create access by any route.

**Acceptance Scenarios**:

1. **Given** the owner-admin has invited `asha.test@example.com`, **When** Asha opens the
   invitation and creates access with that email and a valid password, **Then** her access is
   created, the invitation is marked accepted, and she is taken to first-run setup.
2. **Given** a pending invitation for `asha.test@example.com`, **When** Asha chooses Google
   sign-in with a Google account whose email is `asha.test@example.com`, **Then** her access is
   created and linked to that Google identity.
3. **Given** a pending invitation for `asha.test@example.com`, **When** someone completes Google
   sign-in with a different email (`other@example.com`), **Then** access is refused with a message
   explaining the invitation is for a different email, and no user is created.
4. **Given** no invitation exists for `ravi.test@example.com`, **When** Ravi attempts to sign up
   by email/password or Google, **Then** access is refused and no user is created.
5. **Given** an invitation that has expired or been revoked, **When** the invitee opens it,
   **Then** they see that the invitation is no longer valid and are told to ask the owner for a
   new one.
6. **Given** an invitation has already been accepted, **When** the link is opened again, **Then**
   the person is directed to sign in instead of creating a second access.
7. **Given** the invitee opens the invitation on an Android phone with the app installed, **When**
   they tap the link, **Then** joining continues inside the app; **Given** the app is not
   installed, **Then** a web page lets them join and explains how to get the Android app.

---

### User Story 2 - Returning user signs in, stays signed in and signs out (Priority: P1)

A user signs in on the web or on Android with Google or email and password, stays signed in across
app restarts, can reset a forgotten password, and can sign out of the current device.

**Why this priority**: Daily use depends on fast, reliable sign-in that does not need repeating
every time the app is opened.

**Independent Test**: An existing user signs in on web and Android, closes and reopens both, is
still signed in, signs out on Android only (web stays signed in), and resets a forgotten password
via the emailed reset link.

**Acceptance Scenarios**:

1. **Given** an active user, **When** they sign in with correct credentials, **Then** they reach
   the signed-in home screen on that device.
2. **Given** a signed-in user on Android, **When** they close and reopen the app (with or without
   connectivity), **Then** they remain signed in.
3. **Given** a user who forgot their password, **When** they request a reset for their email,
   **Then** they receive a reset link, can set a new password, and the old password stops working.
4. **Given** a reset is requested for an email with no access, **When** the request is submitted,
   **Then** the same neutral confirmation is shown (no disclosure of whether the email exists).
5. **Given** a user signed in on web and Android, **When** they sign out on Android, **Then**
   Android returns to the sign-in screen and the web session is unaffected.
6. **Given** a user enters a wrong password repeatedly, **When** the attempt limit is exceeded,
   **Then** further attempts are temporarily blocked and the user is told when to retry.
7. **Given** a user signs in on the web without ticking "Keep me signed in", **When** they are
   inactive for 30 minutes or close the browser, **Then** they must sign in again; **Given** they
   ticked it, **Then** the web session persists like on Android.

---

### User Story 3 - First-run setup and regional preferences (Priority: P2)

On first sign-in, the user sets a display name and base currency and reviews regional defaults
(number format, date format, financial-year start, timezone). Later they can change any preference
except base currency, and the app immediately shows amounts and dates their way.

**Why this priority**: Every later module (amounts, dates, financial-year reports) depends on these
preferences; getting them right once avoids confusing displays everywhere else.

**Independent Test**: A new user completes setup accepting defaults; the settings preview shows
`₹12,34,567.00` and `11-Oct-2026`; switching to international grouping shows `₹1,234,567.00`
everywhere the preview and shell display amounts, without restarting.

**Acceptance Scenarios**:

1. **Given** a user signing in for the first time, **When** they reach setup, **Then** they must
   provide a display name and base currency (default INR) before entering the app, and see the
   defaults: Indian grouping, `dd-MMM-yyyy`, financial year starting 1 April, timezone
   Asia/Kolkata.
2. **Given** setup is complete, **When** the user opens Settings, **Then** base currency is shown
   as fixed and cannot be changed.
3. **Given** the user changes number format, date format, financial-year start or timezone,
   **When** they save, **Then** every screen shows the new format immediately, including a live
   preview sample in Settings.
4. **Given** the user leaves setup midway, **When** they sign in again, **Then** they resume setup
   and cannot reach the app until it is complete.

---

### User Story 4 - Owner-admin manages invitations and user access (Priority: P2)

The owner-admin sees all invitations and users, resends or revokes pending invitations, and can
disable or re-enable a user's access, and permanently erase a user and all their data — without
ever seeing anyone's financial data.

**Why this priority**: Needed to run a small tester group safely (e.g., remove a tester who no
longer needs access), but the app is usable by early users before this exists.

**Independent Test**: The owner-admin revokes a pending invitation (the link stops working),
disables an active user (that user is signed out everywhere and cannot sign in), re-enables them
(they can sign in again and their data is intact), and confirms the admin views show no financial
information.

**Acceptance Scenarios**:

1. **Given** the owner-admin opens user management, **When** the page loads, **Then** they see
   invitations with status (pending, accepted, expired, revoked) and users with display name,
   email, access status (active/disabled) and last sign-in time — and nothing else.
2. **Given** a pending invitation, **When** the owner-admin revokes it, **Then** the invitation
   link stops working immediately.
3. **Given** a pending or expired invitation, **When** the owner-admin resends it, **Then** a new
   invitation is issued with a fresh expiry and any earlier link for it stops working.
4. **Given** an active user, **When** the owner-admin disables them, **Then** the user's next
   request to the service from any device is refused and that device is signed out (SC-007); they
   cannot sign in until re-enabled; their data is retained untouched.
5. **Given** the owner-admin tries to disable their own access, **When** they confirm, **Then**
   the action is refused (the single owner-admin cannot lock themselves out).
6. **Given** a non-admin user, **When** they try to reach user management by any route, **Then**
   access is denied.
7. **Given** any user other than the owner-admin, **When** the owner-admin chooses "Erase user",
   **Then** a warning lists what will be permanently erased (sign-in access, preferences and all
   financial data) and the erasure proceeds only after the owner-admin types that user's email
   exactly; afterwards the user cannot sign in, none of their data can be retrieved through the
   app, and the email can be invited again as a brand-new user.
8. **Given** the erase confirmation is cancelled or the typed email does not match, **When** the
   owner-admin stops, **Then** nothing is erased.

---

### User Story 5 - Signed-in app shell (Priority: P2)

After signing in, the user sees a consistent navigation frame on web and Android with entries for
Dashboard, Accounts, Transactions, Payment plan and Settings (sections not yet built show a
"coming soon" placeholder), a visible marker when in the demo environment, and — on Android — a
clear indicator of whether the app is online or offline.

**Why this priority**: Later modules plug into this frame; it must exist before them, but it has
little standalone value.

**Independent Test**: Sign in on web and Android, visit every navigation entry, confirm
placeholders appear, the demo marker is visible in the demo environment, and toggling airplane mode
on Android switches the online/offline indicator within a few seconds.

**Acceptance Scenarios**:

1. **Given** a signed-in user, **When** they open each navigation entry, **Then** the section or
   its placeholder opens and the current section is highlighted.
2. **Given** the app runs in the demo environment, **When** any signed-in screen is shown,
   **Then** a persistent "Demo" marker is visible; in the live environment no marker is shown.
3. **Given** Android loses connectivity, **When** the user is on any screen, **Then** an
   "Offline" indicator appears, and it disappears when connectivity returns.
4. **Given** the owner-admin is signed in, **When** they view navigation, **Then** a
   user-management entry is shown; it is absent for other users.

---

### User Story 6 - Android app lock (Priority: P3)

A user can protect the Android app with a PIN and, optionally, fingerprint, so that anyone picking
up their unlocked phone cannot open their finances.

**Why this priority**: Important privacy protection on a shared or lost phone, but not needed to
start using the app.

**Independent Test**: Enable lock with PIN + fingerprint and a 1-minute timeout; background the app
for 30 seconds (no prompt) and for 2 minutes (prompt); unlock with fingerprint; force fingerprint
failure and unlock with PIN; use "Forgot PIN" and confirm a full sign-in is required.

**Acceptance Scenarios**:

1. **Given** app lock is off, **When** the user enables it, **Then** they must set and confirm a
   4–6 digit PIN, may additionally enable fingerprint if the device supports it, and choose a
   timeout (immediately, 1, 5 or 15 minutes; default immediately).
2. **Given** app lock is on, **When** the app is opened from closed or returns from background
   after the timeout, **Then** content is hidden until the user unlocks with fingerprint or PIN.
3. **Given** the lock screen, **When** fingerprint fails or is unavailable, **Then** the user can
   unlock with the PIN.
4. **Given** 5 consecutive wrong PIN entries, **When** the 5th fails, **Then** the user is signed
   out on this device, locally cached data is removed except entries not yet sent (kept sealed),
   and the user must sign in fully (and set a new PIN) to continue; after the same user signs in
   again on that device, the kept entries are sent.
5. **Given** the user chooses "Forgot PIN", **When** they sign in again successfully, **Then** the
   old PIN is cleared and they can set a new one.
6. **Given** the lock is on, **When** the app appears in the device's recent-apps switcher,
   **Then** its preview does not reveal financial content, while the user can still take
   screenshots inside the app.

---

### User Story 7 - Hide-balances mode (Priority: P3)

From the main navigation, a user toggles a privacy mode that masks every monetary amount in the app
(for example `₹••••`) until they toggle it off, so they can use the app in public.

**Why this priority**: Valuable privacy convenience, independent of everything else; it becomes
more visible once later modules show amounts.

**Independent Test**: Turn hide-balances on; the Settings preview amount and every amount in the
shell show `₹••••`; restart the app on the same device — still masked; another device of the same
user is unaffected.

**Acceptance Scenarios**:

1. **Given** hide-balances is off, **When** the user toggles it on, **Then** every monetary amount
   on every screen is replaced by a mask that does not reveal the number of digits.
2. **Given** hide-balances is on, **When** the app is restarted on that device, **Then** it is
   still on.
3. **Given** hide-balances is on, **When** the user toggles it off, **Then** amounts reappear
   immediately.

---

### Edge Cases

- An invitation is sent to an email that already belongs to an active or disabled user —
  including the owner-admin's own email → refused with "this person already has access"; no
  duplicate user is created. An erased user's email can be invited again as a new user.
- A user's Google account email changes after joining, or Google reports the email as unverified →
  Google sign-in is refused for that user; they can still sign in with email + password (or ask the
  owner-admin for a new invitation after erasure).
- Concurrent admin actions → erase and disable take precedence over any action the affected user
  is performing (it fails and the device is signed out); when a revoke and an acceptance race, the
  first to complete wins and the other party sees a clear message (invitation no longer valid /
  person already has access).
- The hosted environment is temporarily paused or unreachable → apps show a clear "service
  temporarily unavailable" state (Android keeps working on locally held data); the owner-admin
  restores the environment through the hosting provider (see quickstart runbook).
- Email addresses differing only in letter case (`Asha.Test@Example.com`) are treated as the same
  person.
- The same person later signs in with the other method (Google vs email/password) for the same
  email → it reaches the same user, never a second user.
- An invitation is accepted on one device while open on another → the second attempt is directed
  to sign in.
- A user is disabled while their Android app is offline → they keep local, view-only access to data
  already on that device until the device next reaches the service, at which point they are signed
  out; nothing they did offline is uploaded while disabled, and it is not discarded from the device
  until they sign out. Accepted: data already held on a device is outside server enforcement; the
  service itself never serves a disabled user (Principle I).
- A user signs out on Android while changes made offline have not yet been sent → they are warned
  with the number of unsent changes and offered "Send now" or "Sign out anyway (discard unsent
  changes)"; nothing is discarded without that explicit confirmation.
- The device has no fingerprint enrolled or the user removes all fingerprints → fingerprint unlock
  is unavailable and the PIN is used.
- The user changes timezone → dates of past records are shown in the new timezone; no stored data
  is altered.
- Network failure during invitation acceptance or setup → the user can retry without creating
  duplicates and resumes where they left off.
- The owner-admin's own account: cannot be disabled, revoked, demoted or erased through the app; if
  the owner-admin loses every sign-in method, recovery follows FR-013a.
- A user is erased while their Android app is offline → when the device next reaches the service
  the user is signed out, local data on that device is removed, and nothing is uploaded.
- An erased user's earlier audit events → their identifying details are removed with the user;
  only the minimal erasure record remains.

## Requirements *(mandatory)*

### Functional Requirements

**Invitations & joining**

- **FR-001**: The system MUST allow access to be created only by accepting a valid, unexpired,
  unrevoked invitation addressed to the joining person's email.
- **FR-001a**: For the email + password path, possession of a valid invitation link MUST be the
  proof that the person controls the invited email; no separate verification email is sent.
- **FR-002**: Only the owner-admin MUST be able to create, resend and revoke invitations.
- **FR-003**: An invitation MUST expire 7 days after it is issued; resending issues a new
  invitation with a fresh 7-day expiry and invalidates the previous one.
- **FR-003a**: Invitation links MUST be single-use and unguessable (at least 128 bits of
  randomness), MUST be delivered only by email to the invitee, MUST NOT be shown to the
  owner-admin, and MUST NOT appear in audit details or application logs.
- **FR-003b**: If an invitation email cannot be sent (e.g., sending limit reached or sender
  credentials rejected), the invitation MUST still be recorded and the owner-admin MUST see that
  delivery failed, with the option to resend.
- **FR-004**: When joining with Google, the Google account's email MUST match the invited email
  (case-insensitive) and Google MUST report that email as verified; otherwise access MUST be
  refused. The same rule applies to every later Google sign-in.
- **FR-004a**: Opening an invitation on an Android device MUST continue joining in the Android app
  when it is installed, and otherwise on the web, with guidance on obtaining the Android app;
  on other devices joining happens on the web.
- **FR-005**: Email addresses MUST be compared case-insensitively everywhere; one email maps to at
  most one user, whichever sign-in method is used.

**Sign-in & sessions**

- **FR-006**: Users MUST be able to sign in on web and Android with Google or with email + password.
- **FR-007**: Passwords MUST be at least 8 characters; the system MUST reject any password that
  appears in a published list of the 10,000 most commonly used passwords (case-insensitive) or
  equals the part of the user's email before the "@".
- **FR-008**: Users MUST be able to reset a forgotten password via a single-use link sent to
  their email and valid for 1 hour; the response MUST NOT reveal whether the email has access.
- **FR-008a**: Unauthenticated actions MUST be limited to prevent enumeration and email flooding:
  at most 3 password-reset emails per email address per hour, and at most 20 invitation look-ups
  per minute from one network address; excess requests receive the same neutral response or a
  "try again later" message without revealing account existence.
- **FR-009**: After 5 consecutive failed email + password attempts for an email address — counted
  across all devices and networks since that address's last successful sign-in — further password
  attempts for that address MUST be blocked for 15 minutes; a successful sign-in resets the count.
  Google sign-in is not affected by this lockout.
- **FR-010**: Signed-in sessions MUST persist across app restarts until the user signs out, the
  session is ended by the owner-admin disabling the user, or the password is reset — a completed
  password reset MUST end all of the user's other sessions on every device, while the session that
  completed the reset stays signed in. On the web,
  sign-in MUST offer a "Keep me signed in" choice (unticked by default); when unticked, the session
  MUST end after 30 minutes of inactivity or when the browser is closed.
- **FR-011**: Sign-out MUST end the session on the current device only.
- **FR-012**: On Android, an existing signed-in session MUST allow the app to open without
  connectivity; first sign-in requires connectivity.

**Owner-admin & access management**

- **FR-013**: Each environment MUST have exactly one owner-admin, designated when the environment is
  set up; the owner-admin role cannot be granted, removed or transferred in the app.
- **FR-013a**: If the owner-admin loses every sign-in method, recovery MUST be possible only
  outside the app by the person operating the environment, using the documented environment setup
  procedure to move the owner-admin role to a new email; the recovery MUST be audited and MUST NOT
  grant access to any other user's data.
- **FR-014**: The owner-admin MUST be able to view invitations (email, status, issued and expiry
  dates) and users (display name, email, access status, last sign-in time).
- **FR-015**: The owner-admin MUST be able to disable and re-enable any user except themselves.
  Disabling MUST cause the user's next request to the service from any device to be refused (and
  that device to sign out) and MUST prevent sign-in; re-enabling MUST restore access with all their
  data intact.
- **FR-016**: The owner-admin MUST NOT be able to view, change or export any other user's financial
  data or preferences (base currency, number and date format, financial-year start, timezone)
  through the app; admin views MUST show only the fields listed in FR-014 (display name is a
  profile field, not a preference).
- **FR-016a**: The owner-admin MUST be able to permanently erase any user other than themselves,
  removing that user's access, preferences and all data they own. Erasure MUST require dual
  confirmation: (1) a warning describing exactly what will be erased and that it cannot be undone,
  then (2) typing the user's email exactly. Erasure MUST end all of the user's sessions
  immediately, MUST NOT reveal any of the erased data to the owner-admin at any step, and MUST
  leave only a minimal audit record (who erased, when, and a non-identifying reference to the
  erased user). Erasure MUST also remove every invitation record for that email and the user's
  identifiers from earlier audit events. The email MAY later be invited again as a new user with no
  link to the erased data.

**Data isolation**

- **FR-017**: Every piece of user data stored by the system MUST be accessible only to the user who
  owns it; the system MUST enforce this independently of what the app screens allow.
- **FR-018**: Non-admin users MUST NOT be able to see any other user, invitation or admin screen.
- **FR-019**: The demo and live environments MUST have separate users, invitations and data; an
  identity in one environment grants nothing in the other.
- **FR-019a**: Every web deployment and Android build MUST know which environment it belongs to and
  MUST refuse to operate (showing a configuration error) if the backend it connects to reports a
  different environment.

**First-run setup & preferences**

- **FR-020**: On first successful sign-in, users MUST complete setup — display name (1–50
  characters) and base currency (default INR) — before reaching any other screen; incomplete setup
  resumes on next sign-in.
- **FR-021**: Base currency MUST be fixed once setup is complete.
- **FR-022**: Users MUST be able to set number format (Indian lakh/crore grouping, default; or
  international grouping), date format (`dd-MMM-yyyy` default; plus `dd/MM/yyyy` and
  `yyyy-MM-dd`), financial-year start month (April default; any month), and timezone (Asia/Kolkata
  default; any standard timezone).
- **FR-023**: Preference changes MUST apply to every screen immediately without restarting, and
  MUST NOT alter any stored values.
- **FR-024**: Settings MUST show a live preview of a sample amount and date in the chosen formats.
- **FR-025**: Preferences MUST follow the user to every device they sign in on.

**Android app lock**

- **FR-026**: Users MUST be able to enable app lock on Android with a 4–6 digit PIN and optionally
  device fingerprint/biometrics, with a timeout of immediately (default), 1, 5 or 15 minutes.
- **FR-026a**: App lock with PIN MUST be available whether or not the device has its own screen
  lock; fingerprint unlock MUST be offered only when the device has enrolled biometrics.
- **FR-026b**: If the device's enrolled biometrics change after fingerprint unlock was enabled,
  fingerprint unlock MUST be suspended until the user unlocks once with their PIN and re-confirms
  fingerprint use.
- **FR-027**: While app lock is enabled, the app MUST hide all content when locked and MUST keep its
  screens out of the recent-apps preview (guaranteed on Android 13 and later; best effort on older
  versions). Screenshots taken by the user inside the app MUST remain allowed. When app lock is
  disabled, no recent-apps restriction applies.
- **FR-028**: After 5 consecutive wrong PIN entries, the app MUST sign the user out on that device
  and remove all of that user's locally stored data from it **except changes not yet sent**, which
  MUST be kept sealed (not viewable in the app) and sent only after the same user signs in again on
  that device; if a different user signs in on that device, the kept changes MUST NOT be sent under
  that user. The app-lock setup screen MUST explain this behaviour.
- **FR-029**: "Forgot PIN" MUST require a full sign-in, after which the old PIN is cleared.
- **FR-030**: App-lock settings MUST apply to the device on which they were set.

**Hide-balances mode**

- **FR-031**: A hide-balances toggle MUST be reachable from the main navigation on web and Android.
- **FR-032**: When on, every monetary amount the app displays on its own screens — including
  titles, lists, tables, charts, totals and in-app messages — MUST be masked with a fixed-length
  mask that does not reveal digit count; the mechanism MUST be shared so that newly added screens
  are masked without extra work. Content the user deliberately generates to share or export
  (later modules) is outside this toggle and is specified by those modules.
- **FR-033**: The hide-balances choice MUST persist on the device where it was set and MUST NOT
  change the setting on the user's other devices.

**App shell**

- **FR-034**: The signed-in shell MUST provide navigation to Dashboard, Accounts, Transactions,
  Payment plan and Settings on web and Android, plus User management for the owner-admin only;
  unbuilt sections MUST show a "coming soon" placeholder.
- **FR-035**: In the demo environment every signed-in screen MUST show a persistent "Demo" marker;
  the live environment MUST NOT.
- **FR-036**: The Android app MUST show an online/offline indicator that updates within 5 seconds
  of a connectivity change.

**Security baseline**

- **FR-036a**: All communication between the apps and the service MUST be encrypted in transit;
  unencrypted access to any environment MUST be refused or redirected.
- **FR-036b**: Web session credentials MUST NOT be readable by page scripts, MUST be sent only over
  encrypted connections, and state-changing requests (especially owner-admin actions) MUST be
  protected against cross-site request forgery.
- **FR-036c**: The privileged service key and the email-sender credential MUST be replaceable per
  environment through configuration alone (no code change), following a documented rotation
  procedure. Rotating these MUST NOT sign users out; if the secret that signs user sessions is
  suspected compromised, the procedure MUST rotate it, which signs every user out on every device.
- **FR-036d**: Application logs (distinct from audit events) MUST NOT contain email addresses,
  passwords, PINs, invitation or session tokens, or financial details; errors MUST carry a
  reference id so a reported problem can be traced.
- **FR-036e**: When joining, the person MUST be shown a short privacy notice — what is stored about
  them, that the owner-admin can see their name, email, access status and last sign-in time but no
  financial data, and that they can ask the owner-admin to erase them — on every joining path
  (email + password and Google) before access is created, and the system MUST record that it was
  shown.

**Audit**

- **FR-037**: The system MUST record an audit event — actor, time, action, target — for:
  invitation created/resent/revoked/accepted/expired, invitation email delivery failed, user
  disabled/re-enabled, user erased, owner-admin recovered, sign-in success, sign-in failure,
  sign-in locked, password reset requested/completed, sign-out, setup completed, preference
  changed, and app lock enabled/disabled. Audit events MUST NOT contain passwords, PINs or financial data.
- **FR-038**: Audit events MUST be append-only (not editable or deletable through the app).
- **FR-039**: The owner-admin MUST be able to view invitation and access-change events for all
  users; each user MUST be able to view their own recent sign-in activity — successful and failed
  sign-ins and lockouts — with time, method and device type.

### Key Entities

- **User**: A person with access in one environment. Email (unique, case-insensitive), display
  name, sign-in methods linked (Google, email/password), access status (active, disabled), role
  (owner — the owner-admin — or member), last sign-in time, setup-complete flag.
- **Invitation**: An offer of access to one email. Email, issued by, issued at, expires at, status
  (pending, accepted, revoked, superseded; "expired" = still pending after its expiry time),
  accepted at, email delivery status. At most one pending invitation per email.
- **User Preferences**: Owned by one user. Base currency (fixed after setup), number format, date
  format, financial-year start month, timezone.
- **Device Settings** (kept on the device): app-lock enabled, PIN (stored securely), fingerprint
  enabled, timeout, hide-balances on/off.
- **Audit Event**: Append-only record of an identity, access or preference event. Actor, time,
  action, target user or invitation, device type; no secrets or financial data.
- **Environment**: Demo or live. Determines the demo marker and fully separates users and data.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An invited person can go from opening the invitation to the signed-in home screen,
  including first-run setup, in under 3 minutes.
- **SC-002**: 100% of attempts to create access without a valid invitation (uninvited email,
  expired, revoked, mismatched Google email) are refused in acceptance testing.
- **SC-003**: Automated tests covering the agreed isolation rule set (maintained with the plan's
  database contract; at minimum FR-016, FR-017, FR-018 and FR-038) show 0 cases in which one user —
  including the owner-admin — can read or change another user's data.
- **SC-004**: A signed-in returning user reaches the home screen within 3 seconds of opening the
  Android app (lock off), and within 2 seconds of a successful fingerprint unlock (lock on).
- **SC-005**: After a preference change, 100% of amounts and dates on screen use the new format
  without restarting the app.
- **SC-006**: With hide-balances on, a review of every screen in the navigation (in R1: Settings
  preview and shell; each later module adds its screens to the review list) finds 0 unmasked
  amounts.
- **SC-007**: Measured from the owner-admin's confirmation: a revoked invitation link and any new
  sign-in attempt by a disabled user are refused immediately, and every request from an
  already-signed-in device of a disabled user is refused within 1 minute; a device that makes no
  request is signed out at its next request (and, on Android, when the app returns to the
  foreground).
- **SC-008**: 100% of the events listed in FR-037 appear in the audit history during acceptance
  testing, and none contains a password, PIN or financial data.
- **SC-009**: After a user is erased, a search of all stored data for the erased email or user id
  finds nothing except the minimal erasure record, and any of their devices removes its local data
  at its next contact with the service.

## Assumptions

- The owner-admin for each environment is designated by configuration when the environment is set
  up (e.g., by email); the owner-admin joins through the same sign-in flows as everyone else.
- Invitation and password-reset emails are sent by the system; low daily sending limits are
  acceptable because the group is fewer than 20 people.
- App lock and recent-apps hiding are Android-only in Phase 1; the web relies on sign-out and
  browser security.
- On Android, sessions remain valid until sign-out, disable or password reset (app lock covers
  inactivity). On the web, inactivity expiry applies only when "Keep me signed in" is not ticked.
- Display name is the only profile field in Phase 1 (no avatar, phone number or address).
- Language is English only in Phase 1.
- Retention: audit events and disabled users' data are kept for the life of the environment in
  Phase 1 (no automatic purge); erasure is the deletion path.
- Owner-admin alerts for security events (e.g., repeated lockouts) are intentionally out of scope
  in Phase 1; users see their own failed sign-ins (FR-039).
- Accepted residual risks (documented in the plan): (1) the per-email lockout counts attempts made
  through the app; attempts made directly against the authentication provider are limited only by
  the provider's per-network-address limits; (2) a signed-in user could deliberately set a common
  password on their own account by bypassing the app.
- Invitation and reset emails depend on one free mailbox account; if its sending limit or
  credential fails, invitations show "delivery failed" (FR-003b) and resets keep their neutral
  message — the owner-admin fixes the sender and resends.
- The security features relied on from the hosting provider's free plan (sign-up hook, token hook,
  rate limits) were verified on 2026-10-11; the owner re-verifies them before creating each
  environment and whenever the provider announces plan changes.
- Self-service account deletion and "erase all my data" by the user are out of scope (later
  modules); disabled users' data is retained until they are re-enabled or erased by the owner-admin.
- Admin-initiated erasure is permitted by constitution v1.1.0 (Principles I and III, amended
  2026-10-11).
- Demo-data loading/reset (R5) is out of scope; a new user starts with an empty space.
- Examples in this specification use synthetic names and `example.com` emails only.
