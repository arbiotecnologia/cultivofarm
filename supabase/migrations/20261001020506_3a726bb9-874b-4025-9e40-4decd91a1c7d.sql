BEGIN;

CREATE OR REPLACE FUNCTION public._saas_trg_require_feature()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  _uid uuid := auth.uid();
  _key text := TG_ARGV[0];
  _has_org boolean;
BEGIN
  -- Contexto interno (service_role / jobs) sem usuário: não aplica gate.
  IF _uid IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  -- Superadmin de plataforma não opera módulos; não recebe bypass, mas também não tem org.
  SELECT EXISTS (
    SELECT 1 FROM public.profiles pr
    WHERE pr.user_id = _uid AND pr.organization_id IS NOT NULL
  ) INTO _has_org;
  -- Usuários de portal sem vínculo de organização: comportamento preservado (risco residual documentado).
  IF NOT _has_org THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  IF NOT public._saas_user_has_feature(_uid, _key) THEN
    RAISE EXCEPTION 'saas_feature_not_entitled: funcionalidade % não contratada no plano da empresa', _key
      USING ERRCODE = '42501';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

REVOKE ALL ON FUNCTION public._saas_trg_require_feature() FROM PUBLIC, anon, authenticated;

DO $do$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('ordens_servico','ordens_producao'),
    ('ordens_servico_onfarm','ordens_producao'),
    ('lotes','lotes_qualidade'),
    ('controle_qualidade','lotes_qualidade'),
    ('envase','envase'),
    ('estoque_embalagens','estoque_embalagens'),
    ('partner_orders','pedidos_b2b'),
    ('partner_simulations','simulacoes'),
    ('commercial_condition_item_prices','catalogo_precos'),
    ('registros_consultor','visitas_tecnicas'),
    ('ficha_tecnica_versoes','fichas_tecnicas'),
    ('accounts_receivable','contas_receber'),
    ('financial_receipts','contas_receber'),
    ('accounts_payable','contas_pagar'),
    ('payable_payments','contas_pagar')
  ) AS t(tbl, feat) LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_saas_gate ON public.%I', r.tbl);
    EXECUTE format(
      'CREATE TRIGGER trg_saas_gate BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public._saas_trg_require_feature(%L)',
      r.tbl, r.feat);
  END LOOP;
END
$do$;

COMMIT;