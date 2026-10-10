-- HISTORICAL APPLICATION: Codex reports this function/ACL body reviewed and ALREADY
-- APPLIED on swzpzcwiasxmjutrmvkm as 20261010141924 platform_catalog_read_only
-- (external evidence for db8f29b02bb246ff426e9fdb9f981e226e645241, 2026-10-10).
-- DO NOT REAPPLY this historical review harness. BEGIN/ROLLBACK and the original
-- candidate/test-plan comments below describe the pre-application checkpoint only.
-- Exact applied body archived in applied-20261010141924-platform-catalog-read-only.sql.
-- External SQL proof is not HTTP/browser/mobile or a new publication proof.

-- CANDIDATE ONLY, NOT APPLIED. Reviewer must independently prove canonical ref
-- swzpzcwiasxmjutrmvkm BEFORE execution; SQL cannot establish its own project ref.
-- Review live equivalent readers/ownership/readiness first. No table grants/policies.
-- BEGIN/ROLLBACK by default; promotion requires separate explicit authorization.
BEGIN;

-- CREATE (not OR REPLACE) fails closed on a same-signature existing reader.
CREATE FUNCTION platform_private.platform_read_global_product_catalog_core(
  p_search text, p_limit integer, p_offset integer
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_search text;
  v_result jsonb;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'platform_catalog_forbidden';
  END IF;
  -- Signed session iat only; no user_metadata/app_metadata authorization or GUC ticket.
  IF pg_catalog.jsonb_typeof(auth.jwt()->'iat') IS DISTINCT FROM 'number'
     OR COALESCE(auth.jwt()->>'iat', '') !~ '^[0-9]{1,12}$' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'platform_catalog_forbidden';
  END IF;
  IF (auth.jwt()->>'iat')::bigint <= 0
     OR NOT COALESCE(platform_private.platform_actor_access_ready(v_actor), false)
     OR NOT COALESCE(public.has_role(v_actor, 'superadmin'::public.app_role), false)
     OR NOT COALESCE(public.is_platform_superadmin(v_actor), false) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'platform_catalog_forbidden';
  END IF;
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 50
     OR p_offset IS NULL OR p_offset < 0 OR p_offset > 1000000
     OR p_search IS NULL OR pg_catalog.char_length(p_search) > 120 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'platform_catalog_invalid_query';
  END IF;
  v_search := pg_catalog.lower(pg_catalog.btrim(p_search));
  -- Literal substring: %, _, quotes are data, not wildcard/filter syntax.
  -- One snapshot, deterministic tie-breaker; only an extra sentinel is read.
  WITH bounded AS MATERIALIZED (
    SELECT p.id, p.codigo, p.nome, p.tipo, p.ativo, p.b2b_enabled, p.updated_at
    FROM public.produtos p
    WHERE v_search = ''
       OR pg_catalog.strpos(pg_catalog.lower(p.nome), v_search) > 0
       OR pg_catalog.strpos(pg_catalog.lower(COALESCE(p.codigo, '')), v_search) > 0
    ORDER BY pg_catalog.lower(p.nome) COLLATE "C", p.id
    LIMIT (p_limit + 1) OFFSET p_offset
  ), page AS (
    SELECT b.id, b.codigo, b.nome, b.tipo, b.ativo, b.b2b_enabled, b.updated_at
    FROM bounded b
    ORDER BY pg_catalog.lower(b.nome) COLLATE "C", b.id LIMIT p_limit
  )
  SELECT pg_catalog.jsonb_build_object(
    'items', COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(r)
      ORDER BY pg_catalog.lower(r.nome) COLLATE "C", r.id) FROM page r), '[]'::jsonb),
    'has_more', (SELECT pg_catalog.count(*) > p_limit FROM bounded)
  ) INTO v_result;
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION platform_private.platform_read_global_product_catalog_core(text, integer, integer) FROM PUBLIC, anon, authenticated, service_role;
-- INVOKER needs core EXECUTE; core itself authorizes every call. No table SELECT grant.
GRANT EXECUTE ON FUNCTION platform_private.platform_read_global_product_catalog_core(text, integer, integer) TO authenticated;

CREATE FUNCTION public.platform_read_global_product_catalog(
  p_search text DEFAULT '', p_limit integer DEFAULT 50, p_offset integer DEFAULT 0
) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $$ SELECT platform_private.platform_read_global_product_catalog_core(p_search, p_limit, p_offset); $$;
REVOKE ALL ON FUNCTION public.platform_read_global_product_catalog(text, integer, integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.platform_read_global_product_catalog(text, integer, integer) TO authenticated;

-- Reviewer test plan (NOT RUN): use existing authorized real actors, signed/current
-- iat claims in SET LOCAL ROLE authenticated; SAVEPOINT for each expected exception.
-- Deny Financeiro/AdminAR/AdminFSF/ConsultorAR/non-superadmin, inactive/provisional,
-- processing access, iat absent/malformed/<=access_valid_after; no user_metadata role.
-- anon ACL denied; NULL auth.uid denied by core; no service caller bypass.
-- Positive active/ready Superadmin: <=50 items; exact seven keys; no prices/composition;
-- default/empty/search literal %/_/quotes; same-name ties sorted by id; empty far page;
-- limits NULL/0/51, offsets NULL/-1/1000001, search NULL/>120 all fail.
-- Compare table ACL/policies + contained price-sync/log ACLs before/after unchanged.
-- SQL claims are NOT HTTP proof; real browser positive requires later SQL promotion.
-- Existing platform_private schema USAGE/owner privileges must be reviewed live;
-- do not add schema/table grants to bypass missing authorization or RLS.
ROLLBACK;