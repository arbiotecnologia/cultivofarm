-- CANDIDATO FASE B PARA REVISÃO CODEX — NÃO APLICADO / NÃO AUTORIZADO PARA EXECUÇÃO.
-- Destino exclusivo: swzpzcwiasxmjutrmvkm, validado externamente ANTES de executar.
-- Nenhuma nova tabela/RPC/GRANT/policy; nenhum backfill, seed ou canal liberado.
-- Requer pg_get_functiondef/ACL/RLS/triggers atuais e contrato audit confirmado.
-- B1 ADITIVO SOMENTE. B2 separado e NÃO EXECUTÁVEL/NÃO PROMOVIDO.
-- Promoção bloqueada: ator ativo/helper, fonte/exclusão, triggers e ACL vivos.
BEGIN;
DO $preflight$
BEGIN
  IF to_regclass('public.produtos') IS NULL
     OR to_regclass('public.catalog_technical_audit_logs') IS NULL
     OR to_regprocedure('public.is_platform_superadmin(uuid)') IS NULL
     OR to_regprocedure('public.has_role(uuid,public.app_role)') IS NULL THEN
    RAISE EXCEPTION 'catalog_preflight_missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
    AND tablename='produtos' AND policyname='d51_5_catalog_global_mutation'
    AND permissive='RESTRICTIVE' AND cmd='ALL'
    AND qual LIKE '%is_platform_superadmin%') THEN
    RAISE EXCEPTION 'catalog_restrictive_policy_missing';
  END IF;
END $preflight$;

ALTER TABLE public.produtos
  ADD COLUMN IF NOT EXISTS familia_catalogo text,
  ADD COLUMN IF NOT EXISTS classes_catalogo text[],
  ADD COLUMN IF NOT EXISTS classificacao_estado text,
  ADD COLUMN IF NOT EXISTS classificacao_motivo text,
  ADD COLUMN IF NOT EXISTS classificacao_fonte_id uuid,
  ADD COLUMN IF NOT EXISTS classificacao_revisada_por uuid,
  ADD COLUMN IF NOT EXISTS classificacao_revisada_em timestamptz,
  ADD COLUMN IF NOT EXISTS unidade_comercial text,
  -- numeric(18,6) arredonda ANTES do trigger; não rejeita casas extras.
  ADD COLUMN IF NOT EXISTS conteudo_apresentacao numeric(18,6),
  ADD COLUMN IF NOT EXISTS unidade_conteudo text;
-- Sem defaults: legado NULL = pendente, não biológico implícito.
-- Sem FK especulativa: fonte deve existir em catalog_technical_sources e corresponder
-- a produto ou ficha do MESMO produto; validação abaixo.

CREATE OR REPLACE FUNCTION public.catalog_classification_guard_candidate()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE
  allowed text[];
  source_ok boolean;
BEGIN
  -- Só cerca novas escritas classificadas; legacy writes continuam sob fences existentes.
  IF NEW.familia_catalogo IS NULL AND NEW.classes_catalogo IS NULL
    AND NEW.classificacao_estado IS NULL
    AND NEW.unidade_comercial IS NULL AND NEW.unidade_conteudo IS NULL
    AND NEW.conteudo_apresentacao IS NULL AND NEW.classificacao_fonte_id IS NULL
    AND NEW.classificacao_motivo IS NULL AND NEW.classificacao_revisada_por IS NULL
    AND NEW.classificacao_revisada_em IS NULL THEN
    IF TG_OP='UPDATE' AND OLD.familia_catalogo IS NOT NULL THEN
      RAISE EXCEPTION 'catalog_classification_cannot_be_erased';
    END IF;
    IF NEW.tipo IS NULL THEN
      RAISE EXCEPTION 'catalog_legacy_type_required';
    END IF;
    RETURN NEW;
  END IF;
  -- has_role canônico inclui profiles.ativo e readiness/fencing (SQL local 20261007155703).
  -- Definição/ACL atuais devem ser comprovadas antes da promoção; sem fallback.
  IF auth.uid() IS NULL
    OR public.has_role(auth.uid(),'superadmin'::public.app_role) IS DISTINCT FROM true
    OR public.is_platform_superadmin(auth.uid()) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'catalog_platform_required' USING ERRCODE='42501';
  END IF;
  IF TG_OP='UPDATE' AND (NEW.tipo IS DISTINCT FROM OLD.tipo OR NEW.codigo IS DISTINCT FROM OLD.codigo) THEN
    RAISE EXCEPTION 'catalog_legacy_identity_immutable';
  END IF;
  -- B1 mantém NOT NULL, sem caminho nullable ou tipo fictício.
  IF NEW.tipo IS NULL THEN
    RAISE EXCEPTION 'catalog_b1_type_required';
  END IF;
  IF NEW.familia_catalogo IS NULL OR NEW.familia_catalogo NOT IN
    ('biologico','quimico','fertilizante_adubo')
    OR NEW.classificacao_estado IS NULL
    OR NEW.classificacao_estado NOT IN ('pendente','revisado') THEN
    RAISE EXCEPTION 'catalog_classification_invalid';
  END IF;
  allowed := CASE NEW.familia_catalogo
    WHEN 'biologico' THEN ARRAY['biofungicida','bioinseticida','inoculante','solubilizador']
    WHEN 'quimico' THEN ARRAY['herbicida','fungicida','inseticida']
    ELSE ARRAY[]::text[] END;
  IF NEW.classes_catalogo IS NULL
    OR coalesce(array_ndims(NEW.classes_catalogo),1)<>1
    OR array_position(NEW.classes_catalogo,NULL) IS NOT NULL
    OR NOT (NEW.classes_catalogo <@ allowed)
    OR cardinality(NEW.classes_catalogo) <> (SELECT count(DISTINCT x) FROM unnest(NEW.classes_catalogo) x)
    OR (NEW.familia_catalogo <> 'fertilizante_adubo' AND cardinality(NEW.classes_catalogo)=0) THEN
    RAISE EXCEPTION 'catalog_classes_invalid';
  END IF;
  IF NEW.unidade_comercial IS NULL OR NEW.unidade_comercial NOT IN ('L','mL','kg','g','un')
    OR NEW.unidade_conteudo IS NULL OR NEW.unidade_conteudo NOT IN ('L','mL','kg','g','un')
    OR NEW.conteudo_apresentacao IS NULL OR NEW.conteudo_apresentacao<=0
    OR NEW.conteudo_apresentacao::text IN ('NaN','Infinity','-Infinity') THEN
    RAISE EXCEPTION 'catalog_units_invalid';
  END IF;
-- 'un' + conteúdo kg/L é apresentação explícita, não conversão automática.
-- Conversão só L/mL ou kg/g; embalagem por un não entra no motor de volume.
  IF (NEW.unidade_comercial IN ('L','mL') AND NEW.unidade_conteudo NOT IN ('L','mL'))
    OR (NEW.unidade_comercial IN ('kg','g') AND NEW.unidade_conteudo NOT IN ('kg','g'))
    OR (NEW.unidade_conteudo='un' AND
       NEW.conteudo_apresentacao<>trunc(NEW.conteudo_apresentacao)) THEN
    RAISE EXCEPTION 'catalog_dimension_invalid';
  END IF;
  -- Inserts fechados; UPDATE legado preserva canais inclusive ativo=true.
  -- Classificação não exige desativação nem homologa canal novo.
  IF TG_OP='INSERT' THEN
    IF NEW.b2b_enabled IS DISTINCT FROM false OR NEW.ativo IS DISTINCT FROM false THEN
      RAISE EXCEPTION 'catalog_channels_not_homologated';
    END IF;
  ELSE
    IF NEW.b2b_enabled IS DISTINCT FROM OLD.b2b_enabled OR NEW.ativo IS DISTINCT FROM OLD.ativo THEN
      RAISE EXCEPTION 'catalog_channels_immutable_in_classification';
    END IF;
  END IF;
  IF NEW.unidade_conteudo NOT IN ('L','mL') AND
    (NEW.dose_ml_ha IS NOT NULL OR NEW.valor_litro_brl IS NOT NULL
     OR NEW.valor_dose_brl IS NOT NULL OR NEW.valor_ha_brl IS NOT NULL) THEN
    RAISE EXCEPTION 'catalog_liquid_fields_incompatible';
  END IF;
  IF NEW.classificacao_motivo IS NULL OR char_length(btrim(NEW.classificacao_motivo)) NOT BETWEEN 10 AND 500 THEN
    RAISE EXCEPTION 'catalog_review_reason_required';
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM public.catalog_technical_sources s
    WHERE s.id=NEW.classificacao_fonte_id AND (
      (s.entidade_tipo='produto' AND s.entidade_id=NEW.id) OR
      (s.entidade_tipo='ficha_produto' AND EXISTS (
        SELECT 1 FROM public.product_technical_profiles p
        WHERE p.id=s.entidade_id AND p.produto_id=NEW.id)))) INTO source_ok;
  IF (NEW.classificacao_estado='revisado' OR NEW.classificacao_fonte_id IS NOT NULL) AND NOT source_ok THEN
    RAISE EXCEPTION 'catalog_review_source_required';
  END IF;
  -- Autoria só muda no recorte classificatório, nunca por nome/preço/updated_at.
  IF NEW.classificacao_estado='revisado' THEN
    IF TG_OP='INSERT' OR ROW(NEW.familia_catalogo,NEW.classes_catalogo,NEW.classificacao_estado,NEW.classificacao_motivo,
        NEW.classificacao_fonte_id,NEW.unidade_comercial,NEW.conteudo_apresentacao,NEW.unidade_conteudo)
      IS DISTINCT FROM ROW(OLD.familia_catalogo,OLD.classes_catalogo,OLD.classificacao_estado,OLD.classificacao_motivo,
        OLD.classificacao_fonte_id,OLD.unidade_comercial,OLD.conteudo_apresentacao,OLD.unidade_conteudo) THEN
      NEW.classificacao_revisada_por:=auth.uid(); NEW.classificacao_revisada_em:=pg_catalog.now();
    ELSE
      NEW.classificacao_revisada_por:=OLD.classificacao_revisada_por;
      NEW.classificacao_revisada_em:=OLD.classificacao_revisada_em;
    END IF;
  ELSE
    NEW.classificacao_revisada_por:=NULL; NEW.classificacao_revisada_em:=NULL;
  END IF;
  RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION public.catalog_classification_guard_candidate() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS zz_catalog_classification_guard_candidate ON public.produtos;
-- AFTER do sync/pricing/code: verificar ordem real BEFORE; guard final não deixa
-- valores líquidos criados por trigger precedente em item sólido.
CREATE TRIGGER zz_catalog_classification_guard_candidate BEFORE INSERT OR UPDATE ON public.produtos
FOR EACH ROW EXECUTE FUNCTION public.catalog_classification_guard_candidate();

-- Reutiliza ledger técnico; helper trigger interno, NÃO RPC de cadastro.
CREATE OR REPLACE FUNCTION public.catalog_classification_audit_candidate()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE old_data jsonb; new_data jsonb;
  keys text[] := ARRAY['familia_catalogo','classes_catalogo',
    'classificacao_estado','classificacao_motivo','classificacao_fonte_id',
    'classificacao_revisada_por','classificacao_revisada_em','unidade_comercial',
    'conteudo_apresentacao','unidade_conteudo'];
BEGIN
  SELECT jsonb_object_agg(key,value) INTO new_data FROM jsonb_each(to_jsonb(NEW)) WHERE key=ANY(keys);
  IF TG_OP='UPDATE' THEN
    SELECT jsonb_object_agg(key,value) INTO old_data FROM jsonb_each(to_jsonb(OLD)) WHERE key=ANY(keys);
  END IF;
  IF (TG_OP='INSERT' AND NEW.familia_catalogo IS NULL) OR new_data IS NOT DISTINCT FROM old_data THEN
    RETURN NEW;
  END IF;
  IF auth.uid() IS NULL
    OR public.has_role(auth.uid(),'superadmin'::public.app_role) IS DISTINCT FROM true
    OR public.is_platform_superadmin(auth.uid()) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'catalog_platform_required' USING ERRCODE='42501';
  END IF;
  INSERT INTO public.catalog_technical_audit_logs
    (entidade_tipo,entidade_id,acao,dados_anteriores,dados_novos,usuario_id)
  VALUES ('produto',NEW.id,'classificacao_catalogo',old_data,new_data,auth.uid());
  RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION public.catalog_classification_audit_candidate() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_catalog_classification_audit_candidate ON public.produtos;
CREATE TRIGGER trg_catalog_classification_audit_candidate AFTER INSERT OR UPDATE ON public.produtos
FOR EACH ROW EXECUTE FUNCTION public.catalog_classification_audit_candidate();
-- Sem DROP de fences/auditorias existentes. Confirmar ledger immutable/ACL antes promoção.
ROLLBACK; -- revisão transacional, NÃO autorização: não executar neste job.

-- B1 preserva NOT NULL físico, enum e valores de tipo. Novos produtos sem tipo
-- representável NÃO podem ser cadastrados em B1; nunca preencher solo artificial.
-- B2: ver proposed-catalog-classification-b2-not-executable.sql (comentários apenas).
-- Cadastro: /base-tecnica?tab=produtos, ProdutosTab/saveProdutoComCompensacao.
-- Nenhum endpoint admin-catalogo existe. Não reaproveitar wipe como upsert.
