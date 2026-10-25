-- T047 The accounts screen view ("By type" / "My groups") follows the user to every device
-- (FR-009, research R2-12). Changed through PATCH /api/me/preferences like other preferences and
-- recorded by the existing preference change history trigger.

alter table public.user_preferences
  add column accounts_view public.accounts_view not null default 'by_type';

grant update (accounts_view) on public.user_preferences to authenticated;
