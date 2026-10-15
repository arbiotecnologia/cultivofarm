-- ROLLBACK SEGURO do candidato proposed-tenant-catalog-ownership.sql — NÃO APLICAR sem revisão.
-- Princípios: (1) nunca expor privados: se houver linha privada, a coluna/policies NÃO são removidas — o
-- rollback apenas fecha o gate e revoga a fachada; (2) nunca destruir o ledger (catalog_tenant_owned_ledger
-- permanece, imutável); (3) nunca reabrir grants/DML globais; (4) não tocar visibilidade da Fase 1.
BEGIN;
UPDATE platform_private.catalog_ownership_gate SET enabled=false WHERE singleton;
REVOKE EXECUTE ON FUNCTION public.tenant_catalog_owned_mutate(text,text,uuid,timestamptz,jsonb,text,uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION platform_private.catalog_owned_mutate_core(text,text,uuid,timestamptz,jsonb,text,uuid) FROM PUBLIC, anon, authenticated;

DO $$
DECLARE v_private boolean;
BEGIN
  v_private := EXISTS (SELECT 1 FROM public.produtos WHERE owner_organization_id IS NOT NULL)
            OR EXISTS (SELECT 1 FROM public.microrganismos WHERE owner_organization_id IS NOT NULL)
            OR EXISTS (SELECT 1 FROM public.culturas WHERE owner_organization_id IS NOT NULL)
            OR EXISTS (SELECT 1 FROM public.formulacoes WHERE owner_organization_id IS NOT NULL)
            OR EXISTS (SELECT 1 FROM public.catalogo_volumes WHERE owner_organization_id IS NOT NULL);
  IF v_private THEN
    -- Contenção mantida: policies RESTRICTIVE, triggers e coluna permanecem; privados continuam invisíveis
    -- a outras empresas/SA/anon. Remoção estrutural exige decisão explícita sobre os dados.
    RAISE NOTICE 'rollback_partial_private_rows_present: gate OFF e fachada revogada; estrutura preservada';
    RETURN;
  END IF;
  DROP POLICY IF EXISTS catalog_owner_no_direct_write ON public.culturas;
  DROP POLICY IF EXISTS catalog_owner_scope ON public.produtos;
  DROP POLICY IF EXISTS catalog_owner_scope ON public.microrganismos;
  DROP POLICY IF EXISTS catalog_owner_scope ON public.culturas;
  DROP POLICY IF EXISTS catalog_owner_scope ON public.formulacoes;
  DROP POLICY IF EXISTS catalog_owner_scope ON public.catalogo_volumes;
  DROP TRIGGER IF EXISTS trg_catalog_owner_root ON public.produtos;
  DROP TRIGGER IF EXISTS trg_catalog_owner_root ON public.microrganismos;
  DROP TRIGGER IF EXISTS trg_catalog_owner_root ON public.culturas;
  DROP TRIGGER IF EXISTS trg_catalog_owner_child ON public.formulacoes;
  DROP TRIGGER IF EXISTS trg_catalog_owner_child ON public.catalogo_volumes;
  DROP FUNCTION IF EXISTS public.tenant_catalog_owned_mutate(text,text,uuid,timestamptz,jsonb,text,uuid);
  DROP FUNCTION IF EXISTS platform_private.catalog_owned_mutate_core(text,text,uuid,timestamptz,jsonb,text,uuid);
  DROP INDEX IF EXISTS public.produtos_owner_norm_uq, public.microrganismos_owner_norm_uq, public.culturas_owner_norm_uq,
    public.produtos_global_norm_idx, public.microrganismos_global_norm_idx, public.culturas_global_norm_idx,
    public.formulacoes_owner_idx, public.catalogo_volumes_owner_idx;
  ALTER TABLE public.produtos DROP COLUMN owner_organization_id, DROP COLUMN archived_at;
  ALTER TABLE public.microrganismos DROP COLUMN owner_organization_id, DROP COLUMN archived_at;
  ALTER TABLE public.culturas DROP COLUMN owner_organization_id;
  ALTER TABLE public.formulacoes DROP COLUMN owner_organization_id;
  ALTER TABLE public.catalogo_volumes DROP COLUMN owner_organization_id;
  -- Mantidos de propósito: catalog_tenant_owned_ledger (+ trigger imutável), gate (OFF), helpers privados.
END $$;
COMMIT;
