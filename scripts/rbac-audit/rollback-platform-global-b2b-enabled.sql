-- ROLLBACK do candidato proposed-platform-global-b2b-enabled.sql — NÃO APLICAR sem revisão.
-- Remove somente os objetos criados. NÃO reverte valores de b2b_enabled já gravados (dados de negócio;
-- reversão de dado exige nova operação auditada pelo próprio writer, antes deste rollback).
-- Fail-closed: se já houver ledger 'set_global_b2b_enabled', a whitelist do ledger é mantida
-- (o histórico imutável não pode violar o CHECK).
BEGIN;
DROP FUNCTION IF EXISTS public.platform_set_global_b2b_enabled(text,uuid,timestamptz,boolean,text,uuid);
DROP FUNCTION IF EXISTS public.platform_read_global_b2b_state(text,uuid);
DROP FUNCTION IF EXISTS platform_private.set_global_b2b_enabled_core(text,uuid,timestamptz,boolean,text,uuid);
DROP FUNCTION IF EXISTS platform_private.read_global_b2b_state_core(text,uuid);
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.catalog_platform_admin_audit WHERE operation='set_global_b2b_enabled') THEN
    DROP TRIGGER IF EXISTS catalog_b2b_audit_immutable ON public.catalog_platform_admin_audit;
    DROP FUNCTION IF EXISTS platform_private.catalog_b2b_audit_immutable();
    DROP POLICY IF EXISTS catalog_b2b_audit_active_read ON public.catalog_platform_admin_audit;
    ALTER TABLE public.catalog_platform_admin_audit DROP CONSTRAINT catalog_platform_admin_audit_operation_check;
    ALTER TABLE public.catalog_platform_admin_audit ADD CONSTRAINT catalog_platform_admin_audit_operation_check
      CHECK (operation IN ('wipe_global_products','update_global_product_metadata','create_global_product','set_global_product_status',
        'create_global_microorganism','update_global_microorganism','set_global_microorganism_status',
        'create_global_culture','update_global_culture','set_global_culture_status',
        'create_global_volume','update_global_volume','set_global_volume_status'));
  ELSE
    RAISE NOTICE 'ledger set_global_b2b_enabled existente: política, trigger imutável e CHECK preservados';
  END IF;
END $$;
-- Restaura a função anterior do trigger de versão de produtos somente se este candidato a trocou.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.produtos'::regclass AND tgname='update_produtos_updated_at'
      AND NOT tgisinternal AND tgfoid='platform_private.catalog_touch_version()'::regprocedure) THEN
    DROP TRIGGER update_produtos_updated_at ON public.produtos;
    CREATE TRIGGER update_produtos_updated_at BEFORE UPDATE ON public.produtos
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  ELSE
    RAISE NOTICE 'update_produtos_updated_at não usa catalog_touch_version: nada a restaurar';
  END IF;
END $$;
COMMIT;
