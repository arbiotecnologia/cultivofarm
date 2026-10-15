-- ROLLBACK SEGURO dos candidatos 01+02 de ownership — NÃO APLICAR sem revisão.
-- Princípios: (1) nunca expor privados; (2) nunca destruir ledger (catalog_tenant_owned_ledger) nem
-- preferências/ledger da Fase 1; (3) nunca reabrir grants/DML globais; (4) filtros [OWNER] dos leitores do 02
-- são MANTIDOS (inertes sem privados) — removê-los exige restaurar as definições "antes" fixadas por md5 no 02.
-- Consequência: se o 02 estiver aplicado, as colunas owner_organization_id NÃO são removidas (os leitores
-- dependem delas); o rollback fecha gate e revoga as fachadas. Remoção estrutural = rodada própria.
BEGIN;
UPDATE platform_private.catalog_ownership_gate SET enabled=false, readers_certified_at=NULL WHERE singleton;
REVOKE EXECUTE ON FUNCTION public.tenant_catalog_owned_mutate(text,text,uuid,timestamptz,jsonb,text,uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION platform_private.catalog_owned_mutate_core(text,text,uuid,timestamptz,jsonb,text,uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tenant_catalog_owned_list(text,text,integer,integer,boolean) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION platform_private.catalog_owned_list_core(text,text,integer,integer,boolean) FROM PUBLIC, anon, authenticated;

DO $$
DECLARE v_private boolean; v_readers boolean; t text;
BEGIN
  v_private := EXISTS (SELECT 1 FROM public.produtos WHERE owner_organization_id IS NOT NULL)
            OR EXISTS (SELECT 1 FROM public.microrganismos WHERE owner_organization_id IS NOT NULL)
            OR EXISTS (SELECT 1 FROM public.culturas WHERE owner_organization_id IS NOT NULL)
            OR EXISTS (SELECT 1 FROM public.formulacoes WHERE owner_organization_id IS NOT NULL)
            OR EXISTS (SELECT 1 FROM public.catalogo_volumes WHERE owner_organization_id IS NOT NULL);
  v_readers := to_regprocedure('platform_private.catalog_item_in_reader_scope(uuid,uuid)') IS NOT NULL
            OR to_regprocedure('platform_private.catalog_b2b_supplier_org(uuid)') IS NOT NULL;
  IF v_private OR v_readers THEN
    RAISE NOTICE 'rollback_partial: gate OFF e fachadas revogadas; estrutura/filtros preservados (privados=% leitores02=%)', v_private, v_readers;
    RETURN;
  END IF;
  FOREACH t IN ARRAY ARRAY['produtos','microrganismos','culturas','formulacoes','catalogo_volumes'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS catalog_owner_scope ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS catalog_owner_no_direct_insert ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS catalog_owner_no_direct_update ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS catalog_owner_no_direct_delete ON public.%I', t);
  END LOOP;
  DROP TRIGGER IF EXISTS trg_catalog_visibility_global_only ON public.catalog_tenant_visibility;
  DROP TRIGGER IF EXISTS trg_catalog_owner_root ON public.produtos;
  DROP TRIGGER IF EXISTS trg_catalog_owner_root ON public.microrganismos;
  DROP TRIGGER IF EXISTS trg_catalog_owner_root ON public.culturas;
  DROP TRIGGER IF EXISTS trg_catalog_owner_child ON public.formulacoes;
  DROP TRIGGER IF EXISTS trg_catalog_owner_child ON public.catalogo_volumes;
  DROP FUNCTION IF EXISTS platform_private.trg_catalog_owner_child_formulacoes();
  DROP FUNCTION IF EXISTS platform_private.trg_catalog_owner_child_volumes();
  DROP FUNCTION IF EXISTS public.tenant_catalog_owned_mutate(text,text,uuid,timestamptz,jsonb,text,uuid);
  DROP FUNCTION IF EXISTS platform_private.catalog_owned_mutate_core(text,text,uuid,timestamptz,jsonb,text,uuid);
  DROP FUNCTION IF EXISTS public.tenant_catalog_owned_list(text,text,integer,integer,boolean);
  DROP FUNCTION IF EXISTS platform_private.catalog_owned_list_core(text,text,integer,integer,boolean);
  -- Unicidade global legada restaurada ANTES de remover os índices reescopados (sem janela sem unicidade).
  CREATE UNIQUE INDEX IF NOT EXISTS microrganismos_nome_unique ON public.microrganismos (nome);
  CREATE UNIQUE INDEX IF NOT EXISTS culturas_nome_ci_uidx ON public.culturas (lower(btrim(nome)));
  DROP INDEX IF EXISTS public.microrganismos_nome_global_uq, public.culturas_nome_ci_global_uq,
    public.produtos_owner_norm_uq, public.microrganismos_owner_norm_uq, public.culturas_owner_norm_uq,
    public.produtos_global_norm_idx, public.microrganismos_global_norm_idx, public.culturas_global_norm_idx,
    public.produtos_owner_list_idx, public.microrganismos_owner_list_idx, public.culturas_owner_list_idx,
    public.formulacoes_owner_idx, public.catalogo_volumes_owner_idx;
  ALTER TABLE public.produtos DROP COLUMN owner_organization_id, DROP COLUMN archived_at;
  ALTER TABLE public.microrganismos DROP COLUMN owner_organization_id, DROP COLUMN archived_at;
  ALTER TABLE public.culturas DROP COLUMN owner_organization_id, DROP COLUMN archived_at;
  ALTER TABLE public.formulacoes DROP COLUMN owner_organization_id;
  ALTER TABLE public.catalogo_volumes DROP COLUMN owner_organization_id;
  -- Mantidos: catalog_tenant_owned_ledger (+ imutabilidade), gate (OFF), helpers privados sem EXECUTE de cliente.
END $$;
COMMIT;
