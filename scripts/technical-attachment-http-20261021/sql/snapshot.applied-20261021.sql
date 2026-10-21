-- APPLIED EXTERNALLY 2026-10-21 on swzpzcwiasxmjutrmvkm (owner-reported and homologated:
-- RPC technical_attachment_download_snapshot INVOKER STABLE, search_path '', authenticated only).
-- AUDIT RECORD ONLY — do NOT reapply. Live database state is authoritative.
-- No Storage object reads here: origin GET containment cannot prevent the actor proof.
BEGIN;
CREATE OR REPLACE FUNCTION public.technical_attachment_download_snapshot(_name text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
 WITH actor AS MATERIALIZED (
   SELECT auth.uid() AS uid, public.h15_actor_organization() AS org
   WHERE auth.uid() IS NOT NULL AND public.technical_actor_ready(auth.uid())
     AND public.storage1_path_strict(_name)
     AND _name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/(foto|audio|documento)/[A-Za-z0-9_.-]+$'
     AND public.storage1_consultor_allowed(_name, 'select')
 ), roles AS MATERIALIZED (
   SELECT jsonb_agg(ur.role::text ORDER BY ur.role::text) AS value
   FROM public.user_roles ur JOIN actor a ON ur.user_id = a.uid
 ), docs AS MATERIALIZED (
   SELECT f.id, f.arquivo_path, r.id AS visit, r.cliente_id AS client, a.uid, a.org
   FROM public.registros_consultor_arquivos f
   JOIN public.registros_consultor r ON r.id = f.registro_consultor_id
   JOIN public.clientes c ON c.id = r.cliente_id
   JOIN actor a ON a.org = c.organization_id
   WHERE f.arquivo_path = _name
     AND split_part(_name, '/', 1) = a.org::text
     AND split_part(_name, '/', 2) = r.id::text
     AND public.technical_refs_in_actor_tenant(r.cliente_id, r.fazenda_id, r.talhao_id)
     AND public.technical_child_read_scope(r.id)
 )
 SELECT CASE WHEN (SELECT count(*) FROM docs) = 1
   AND jsonb_array_length(coalesce((SELECT value FROM roles), '[]'::jsonb)) > 0
 THEN (SELECT jsonb_build_object('actor', uid, 'tenant', org, 'roles', (SELECT value FROM roles),
   'document', id, 'visit', visit, 'client', client, 'path', arquivo_path,
   'size', NULL, 'mime', NULL) FROM docs) ELSE NULL END;
$$;
REVOKE ALL ON FUNCTION public.technical_attachment_download_snapshot(text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.technical_attachment_download_snapshot(text) TO authenticated;
COMMIT;
-- No invented size/mime/deleted_at: those fields are not proven on this record table.
-- A removed/invisible record fails proof. Any LIVE softdelete predicate must be captured
-- and incorporated before promotion; helper-only visibility is not sufficient evidence.