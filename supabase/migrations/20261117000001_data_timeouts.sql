-- Longer time limits for the few calls that work through a whole household at once (found while testing
-- the Android client: a reset-and-load of the demo hit the 8-second limit Supabase sets for signed-in
-- requests, under load). PostgREST applies a function's own `statement_timeout` to the request that calls
-- it (verified locally: a function setting overrides the role's limit; without it the call is cancelled).
--
-- REVIEW: only the time limit changes; no behaviour or access does.

alter function app.load_demo_data(jsonb, text) set statement_timeout = '60s';
alter function app.reset_and_load_demo(jsonb, text) set statement_timeout = '60s';
alter function app.reset_my_data(text) set statement_timeout = '60s';
alter function app.import_chunk(uuid, jsonb) set statement_timeout = '30s';
alter function app.import_abort(uuid) set statement_timeout = '60s';
