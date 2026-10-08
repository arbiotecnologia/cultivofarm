-- Canonical project swzpzcwiasxmjutrmvkm. No Auth/role/profile writes; preferences/logs rollback.
BEGIN;
DO $proof$
DECLARE v jsonb; u uuid; n int:=0;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261008150531') THEN RAISE EXCEPTION 'canonical_baseline_missing'; END IF;
 PERFORM set_config('request.jwt.claim.sub','1298df7d-847b-442a-aacc-7f018d331aa6',true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub','1298df7d-847b-442a-aacc-7f018d331aa6','role','authenticated','iat',extract(epoch from now())::bigint)::text,true);
 v:=public.get_my_available_portal_contexts();
 IF v->'available_contexts' <> '["admin","technical"]'::jsonb OR v->>'is_admin'<>'true' OR v->>'has_b2b_access'<>'true' THEN RAISE EXCEPTION 'multipapel_contexts_failed:%',v; END IF;
 v:=public.set_my_context_preference('technical',true);
 IF v->>'ok'<>'true' THEN RAISE EXCEPTION 'technical_preference_failed'; END IF;
 v:=public.get_my_available_portal_contexts();
 IF v->>'preferred_context'<>'technical' OR v->>'skip_context_selector'<>'true' THEN RAISE EXCEPTION 'technical_preference_read_failed'; END IF;
 v:=public.set_my_context_preference('admin',true);
 IF v->>'ok'<>'true' THEN RAISE EXCEPTION 'management_preference_failed'; END IF;
 v:=public.register_my_login_redirect_secure('admin');
 IF v->>'ok'<>'true' THEN RAISE EXCEPTION 'management_log_failed'; END IF;
 v:=public.set_my_context_preference('b2b',true);
 IF v->>'ok'<>'false' THEN RAISE EXCEPTION 'invented_partner_context'; END IF;
 v:=public.set_my_context_preference('admin',false);
 IF v->>'ok'<>'true' THEN RAISE EXCEPTION 'clear_preference_failed'; END IF;
 v:=public.get_my_available_portal_contexts();
 IF v->>'preferred_context' IS NOT NULL OR v->>'skip_context_selector'<>'false' THEN RAISE EXCEPTION 'preference_not_cleared'; END IF;
 PERFORM set_config('request.jwt.claim.sub','70956249-6294-48da-a046-006b5cced0bb',true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub','70956249-6294-48da-a046-006b5cced0bb','role','authenticated','iat',extract(epoch from now())::bigint)::text,true);
 v:=public.get_my_available_portal_contexts();
 IF NOT(v->'available_contexts' ? 'admin') OR NOT(v->>'has_b2b_access')::boolean THEN RAISE EXCEPTION 'legacy_admin_access_lost'; END IF;
 IF EXISTS(SELECT 1 FROM public.user_access_preferences WHERE user_id=auth.uid()) THEN RAISE EXCEPTION 'preference_cross_identity'; END IF;
 FOREACH u IN ARRAY ARRAY['d856140b-26c9-4d6a-a5aa-8bea47e78fff'::uuid,'ef031451-3fa1-462d-a792-f1e72f335257'::uuid] LOOP
  PERFORM set_config('request.jwt.claim.sub',u::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated','iat',extract(epoch from now())::bigint)::text,true);
  v:=public.get_my_available_portal_contexts();
  IF v->'available_contexts'<>'[]'::jsonb THEN RAISE EXCEPTION 'unready_contexts'; END IF;
  BEGIN PERFORM public.set_my_context_preference('admin',true); RAISE EXCEPTION 'unready_write_allowed'; EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'not authenticated' THEN RAISE; END IF; n:=n+1; END;
  BEGIN PERFORM public.register_my_login_redirect_secure('admin'); RAISE EXCEPTION 'unready_log_allowed'; EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'not authenticated' THEN RAISE; END IF; n:=n+1; END;
 END LOOP;
 PERFORM set_config('request.jwt.claim.sub','',true); PERFORM set_config('request.jwt.claims','{}',true);
 v:=public.get_my_available_portal_contexts(); IF v->'available_contexts'<>'[]'::jsonb THEN RAISE EXCEPTION 'no_uid_contexts'; END IF;
 BEGIN PERFORM public.set_my_context_preference('admin',true); RAISE EXCEPTION 'no_uid_write_allowed'; EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'not authenticated' THEN RAISE; END IF; n:=n+1; END;
 IF n<>5 THEN RAISE EXCEPTION 'proof_count'; END IF;
 RAISE NOTICE 'MULTIPORTAL1 positive_management_technical=1 legacy_admin=1 b2b_denied=1 unready_mutations_denied=5; rollback required; SQL claims NOT JWT/API/browser';
END $proof$;
ROLLBACK;
SELECT 'preferences' as source,count(*),md5(coalesce(string_agg(to_jsonb(t)::text,'' order by user_id),'')) hash FROM public.user_access_preferences t
UNION ALL SELECT 'logs',count(*),md5(coalesce(string_agg(to_jsonb(t)::text,'' order by id),'')) FROM public.user_context_access_logs t;
