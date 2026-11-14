-- The whole-household calls carry their own, longer time limit (20261117000001_data_timeouts.sql).
begin;
select plan(5);

select ok((select 'statement_timeout=60s' = any(proconfig) from pg_proc where oid = 'app.load_demo_data(jsonb, text)'::regprocedure), 'demo load: 60 s');
select ok((select 'statement_timeout=60s' = any(proconfig) from pg_proc where oid = 'app.reset_and_load_demo(jsonb, text)'::regprocedure), 'reset and load: 60 s');
select ok((select 'statement_timeout=60s' = any(proconfig) from pg_proc where oid = 'app.reset_my_data(text)'::regprocedure), 'reset: 60 s');
select ok((select 'statement_timeout=30s' = any(proconfig) from pg_proc where oid = 'app.import_chunk(uuid, jsonb)'::regprocedure), 'an import part: 30 s');
select ok((select 'statement_timeout=60s' = any(proconfig) from pg_proc where oid = 'app.import_abort(uuid)'::regprocedure), 'undoing an import: 60 s');

select * from finish();
rollback;
