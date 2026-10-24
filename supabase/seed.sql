-- T045 Local development seed (applied by `supabase db reset`). Synthetic data only.
-- The local stack behaves like the demo environment. No users are created here: the owner is
-- invited with `pnpm env:bootstrap`, which also sets this row on hosted environments.
insert into private.environment (id, name) values (1, 'demo')
on conflict (id) do nothing;
