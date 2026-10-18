-- ENTREGA OPERACIONAL 1 (candidata REVISÁVEL, NÃO instalada).
-- Alvo: public.can_user_access_cliente(uuid,uuid) — fecha brecha de vínculo B2B revogado.
-- Padrão idêntico à correção já instalada 20261016234052 (ramo user_clientes):
--   guarda de hash do corpo hospedado + substituição de marcador exato, transacional.
-- Baseline hospedado comprovado em 2026-10-18: md5(pg_get_functiondef) = c610786fc9f6d6a44453b9e63c91e974
-- NÃO altera: assinatura, owner, ACL, search_path, ramos admin/gestor/técnico/user_clientes,
--   containment PUC (RESTRICTIVE false), nenhuma das 12 policies dependentes.
-- NÃO impõe self-only: o overload autoriza ALVO terceiro por desenho (callers internos).
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';

DO $migration$
DECLARE
  v_definition text;
  -- Marcador 1: ramo parceiro_b2b sem revoked_at nem validação de parceiro.
  v_marker_b2b text := E'      SELECT 1 FROM public.partner_clients pc\n      JOIN public.partner_users pu ON pu.partner_id = pc.partner_id\n      WHERE pu.user_id = _user_id AND pc.cliente_id = _cliente_id AND pc.active = true';
  v_repl_b2b text := E'      SELECT 1 FROM public.partner_clients pc\n      JOIN public.partner_users pu ON pu.partner_id = pc.partner_id\n      JOIN public.partner_accounts pa ON pa.id = pu.partner_id\n      WHERE pu.user_id = _user_id AND pc.cliente_id = _cliente_id AND pc.active = true\n        AND pu.revoked_at IS NULL\n        AND pa.ativo = true AND pa.deleted_at IS NULL\n        AND (\n          (pa.commercial_owner_organization_id IS NOT NULL\n           AND pu.tenant_id IS NOT NULL\n           AND pu.tenant_id = pa.commercial_owner_organization_id)\n          OR pa.commercial_owner_organization_id IS NULL -- legacy_partner_tenant comprovado\n        )';
  -- Marcador 2: ramo parceiro_b2b_tecnico sem revoked_at nem parceiro vigente.
  v_marker_tec text := E'      SELECT 1 FROM public.partner_user_clients puc\n      WHERE puc.user_id = _user_id AND puc.cliente_id = _cliente_id AND puc.active = true\n    ) OR EXISTS (\n      SELECT 1 FROM public.partner_technician_clients ptc\n      WHERE ptc.technician_user_id = _user_id AND ptc.cliente_id = _cliente_id AND ptc.active = true\n    )), false);';
  v_repl_tec text := E'      SELECT 1 FROM public.partner_user_clients puc\n      JOIN public.partner_users pu2 ON pu2.partner_id = puc.partner_id AND pu2.user_id = puc.user_id\n      JOIN public.partner_accounts pa2 ON pa2.id = puc.partner_id\n      WHERE puc.user_id = _user_id AND puc.cliente_id = _cliente_id AND puc.active = true\n        AND puc.revoked_at IS NULL\n        AND pu2.revoked_at IS NULL\n        AND pa2.ativo = true AND pa2.deleted_at IS NULL\n    ) OR EXISTS (\n      SELECT 1 FROM public.partner_technician_clients ptc\n      JOIN public.partner_users pu3 ON pu3.partner_id = ptc.partner_id AND pu3.user_id = ptc.technician_user_id\n      JOIN public.partner_accounts pa3 ON pa3.id = ptc.partner_id\n      WHERE ptc.technician_user_id = _user_id AND ptc.cliente_id = _cliente_id AND ptc.active = true\n        AND pu3.revoked_at IS NULL\n        AND pa3.ativo = true AND pa3.deleted_at IS NULL\n    )), false);';
BEGIN
  SELECT pg_get_functiondef('public.can_user_access_cliente(uuid,uuid)'::regprocedure)
    INTO v_definition;
  IF md5(v_definition) IS DISTINCT FROM 'c610786fc9f6d6a44453b9e63c91e974' THEN
    RAISE EXCEPTION 'entrega1_client_access_definition_drift';
  END IF;
  IF (length(v_definition)-length(replace(v_definition,v_marker_b2b,'')))/length(v_marker_b2b) <> 1 THEN
    RAISE EXCEPTION 'entrega1_client_access_marker_b2b_drift';
  END IF;
  IF (length(v_definition)-length(replace(v_definition,v_marker_tec,'')))/length(v_marker_tec) <> 1 THEN
    RAISE EXCEPTION 'entrega1_client_access_marker_tec_drift';
  END IF;
  v_definition := replace(v_definition, v_marker_b2b, v_repl_b2b);
  v_definition := replace(v_definition, v_marker_tec, v_repl_tec);
  EXECUTE v_definition;
END
$migration$;

-- Pós-condição read-only (falha a transação se divergir):
DO $post$
DECLARE v_definition text;
BEGIN
  SELECT pg_get_functiondef('public.can_user_access_cliente(uuid,uuid)'::regprocedure)
    INTO v_definition;
  IF position('pu.revoked_at IS NULL' IN v_definition) = 0
     OR position('puc.revoked_at IS NULL' IN v_definition) = 0
     OR position('pa.ativo = true AND pa.deleted_at IS NULL' IN v_definition) = 0 THEN
    RAISE EXCEPTION 'entrega1_client_access_postcondition_failed';
  END IF;
END
$post$;

COMMIT;
-- Rollback: arquivo vinculos-b2b-entrega1-rollback-20261018.sql (restaura corpo baseline
-- exato c610786f..., com guarda de hash do corpo NOVO antes de reverter).
