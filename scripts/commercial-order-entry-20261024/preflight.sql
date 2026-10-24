-- REVIEW ONLY / INACTIVE. Never apply without independent review and owner-run release.
-- Single transaction: PRE, DDL and POST share one txid. Writer, accounting gate and downstream containment untouched.
BEGIN READ ONLY;
DO $pre$ BEGIN
 SET LOCAL lock_timeout='5s';
 IF md5(pg_get_functiondef('platform_private.c2_owner_order_create_allowed(uuid,uuid)'::regprocedure)) IS DISTINCT FROM 'a0417d6727d78412849916a95b250bde' THEN RAISE EXCEPTION 'C2IOE_DEPENDENCY_DRIFT:platform_private.c2_owner_order_create_allowed(uuid,uuid)'; END IF;
 IF md5(pg_get_functiondef('platform_private.b2b_internal_commercial_actor()'::regprocedure)) IS DISTINCT FROM '6555396c4f8fe914177d2ccfc3891279' THEN RAISE EXCEPTION 'C2IOE_DEPENDENCY_DRIFT:platform_private.b2b_internal_commercial_actor()'; END IF;
 IF md5(pg_get_functiondef('platform_private.b2b_actor_scope(uuid)'::regprocedure)) IS DISTINCT FROM 'c3f2997746f24bc2efd15db5c0ccc862' THEN RAISE EXCEPTION 'C2IOE_DEPENDENCY_DRIFT:platform_private.b2b_actor_scope(uuid)'; END IF;
 IF md5(pg_get_functiondef('public.create_partner_order_secure(uuid,text,jsonb,date,uuid,date,integer,text,text)'::regprocedure)) IS DISTINCT FROM '12ea8b410e8fadf2da8f72fc1bbc83cf' THEN RAISE EXCEPTION 'C2IOE_DEPENDENCY_DRIFT:public.create_partner_order_secure(uuid,text,jsonb,date,uuid,date,integer,text,text)'; END IF;
 IF md5(pg_get_functiondef('public.simulate_b2b_payment_plan_secure(uuid,uuid,jsonb,date)'::regprocedure)) IS DISTINCT FROM '37d4f45e388ed7b38f6f397b672629ee' THEN RAISE EXCEPTION 'C2IOE_DEPENDENCY_DRIFT:public.simulate_b2b_payment_plan_secure(uuid,uuid,jsonb,date)'; END IF;
 IF md5(pg_get_functiondef('platform_private.c2_order_actor_scope(uuid,uuid)'::regprocedure)) IS DISTINCT FROM '6802c693f459a92e70dade0c73d7faba' THEN RAISE EXCEPTION 'C2IOE_PRE_LIVE_DRIFT:platform_private.c2_order_actor_scope(uuid,uuid)'; END IF;
 IF to_regprocedure('public.c2_internal_order_entry_capability_v1()') IS NOT NULL OR to_regprocedure('platform_private.c2_internal_order_target_reason(uuid,uuid)') IS NOT NULL THEN RAISE EXCEPTION 'C2IOE_PRE_ALREADY_PRESENT'; END IF;
END $pre$;
SELECT 'C2IOE_PREFLIGHT_PASS';
COMMIT;
