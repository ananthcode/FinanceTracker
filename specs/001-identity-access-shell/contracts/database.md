# Contract: Database functions, hooks and access rules (R1)

Tables are defined in [data-model.md](../data-model.md). This contract fixes the behaviour that
tests in `supabase/tests/` (pgTAP) must prove.

## Auth hooks (configured per environment)

| Hook | Function | Behaviour |
|------|----------|-----------|
| Before User Created | `app.hook_before_user_created(event jsonb)` | Allow only if a `pending`, unexpired invitation exists for the email (case-insensitive); else return error `INVITE_REQUIRED`. |
| Custom Access Token | `app.hook_custom_access_token(event jsonb)` | Refuse to issue/refresh tokens when the user's profile is `disabled`, the email is locked in `private.sign_in_attempts`, or — for a Google sign-in — the Google identity's email no longer matches the user's email (case-insensitive) or is unverified (FR-004); add claim `app_role` (`owner`/`member`). |

## Triggers

| Trigger | On | Effect |
|---------|----|--------|
| `on_auth_user_created` | `AFTER INSERT ON auth.users` | Insert `profiles` (role from invitation) + default `user_preferences`; mark invitation `accepted`; write `invitation_accepted`. |
| `lock_base_currency` | `BEFORE UPDATE ON user_preferences` | Reject `base_currency` change once setup is complete. |
| `capture_change` | `AFTER UPDATE ON user_preferences` (reused by later tables) | Write before/after to `audit_events`. |

## Functions callable by clients (RPC)

| Function | Caller | Returns |
|----------|--------|---------|
| `app.is_active_user()` | used inside policies | boolean |
| `app.record_sign_in(method text, device text)` | signed-in user (after Google OAuth) | void; writes `sign_in_succeeded`, updates `last_sign_in_at` |
| `app.health()` | anon | `{ status: 'ok', environment: 'demo'\|'live' }` (keep-alive; environment guard FR-019a) |

## Server-only functions (service role)

`app.admin_list_users()`, `app.admin_audit_feed(cursor)`, `app.set_user_status(user_id, status)`,
`app.scrub_user_from_audit(user_id)`, `app.register_failed_sign_in(email)`,
`app.clear_failed_sign_ins(email)`. All `SECURITY DEFINER`, `search_path` pinned, `EXECUTE`
revoked from `anon` and `authenticated`.

## Access rules that tests MUST prove (Principle I, IX; SC-003)

1. User A cannot `SELECT`/`UPDATE` user B's `profiles` or `user_preferences` rows.
2. The owner cannot `SELECT` any other user's `user_preferences` and sees other profiles only via
   `app.admin_list_users()` columns.
3. No client role can read `invitations`, `private.*`, or other users' audit events.
4. No client role can `UPDATE` or `DELETE` `audit_events`.
5. A disabled user gets zero rows from every user-owned table.
6. `role` and `status` cannot be changed by any client.
7. The Before User Created hook rejects uninvited, expired, revoked and superseded invitations.
8. After erasing X, no audit row contains X's id or email and no `invitations` row has X's email
   (SC-009).
9. Base currency cannot change after setup.
10. A second `owner` profile cannot be inserted. Owner recovery (FR-013a, `pnpm env:recover-owner`)
    moves the role instead: `app.transfer_owner(new_owner)` for an existing user, or — for an email
    with no account — an **owner** invitation (creatable only with the service role) whose
    acceptance demotes the current owner to member before the new profile is inserted. Both write
    `owner_recovered`; the recovery script revokes any other pending owner invitation first.
11. No client role can read or write `private.rate_limits` or `private.environment`.
12. `audit_events.details` never contains invitation tokens (token columns are never copied).
