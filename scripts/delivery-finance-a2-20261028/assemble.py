"""Review-only deterministic assembly from historical candidate; never connects to DB."""
from pathlib import Path
import re, json, hashlib, difflib
ROOT=Path(__file__).resolve().parent
OLD=ROOT.parent/'delivery-billing-scope-20261027'/'candidate.sql.review'
s=OLD.read_text()
def change(a,b,count=1):
 global s
 assert s.count(a)==count,(a[:90],s.count(a),count)
 s=s.replace(a,b)
s=s[:s.index('-- ACL unchanged')]
change("SET search_path TO 'public'", "SET search_path TO 'pg_catalog', 'public', 'pg_temp'",2)
# No STABLE authority calls after a wait: each VOLATILE PL/pgSQL SELECT gets a fresh
# command snapshot. Canonical role/access predicate copied exactly, narrowed to internal.
authority="""SELECT p.organization_id INTO v_org
    FROM public.profiles p JOIN public.organizations o ON o.id=p.organization_id AND o.ativo IS TRUE
   WHERE p.user_id=v_uid AND p.ativo IS TRUE AND p.senha_provisoria IS FALSE
     AND EXISTS(SELECT 1 FROM public.user_roles r WHERE r.user_id=v_uid
                 AND r.role IN ('administrador','gestor','financeiro'))
     AND NOT EXISTS(SELECT 1 FROM public.user_roles r WHERE r.user_id=v_uid
                 AND r.role IN ('parceiro_b2b','parceiro_b2b_tecnico','cliente_produtor'))
     AND NOT EXISTS(SELECT 1 FROM public.partner_users pu WHERE pu.user_id=v_uid)
     AND NOT EXISTS(SELECT 1 FROM public.platform_org_admin_invites i WHERE i.user_id=v_uid
       AND (i.access_operation_status='processing' OR (i.access_valid_after IS NOT NULL
         AND auth.uid()=v_uid AND to_timestamp(COALESCE((auth.jwt()->>'iat')::bigint,0))<=i.access_valid_after)));
  IF v_org IS NULL THEN RAISE EXCEPTION 'DELIVERY_FINANCE_FORBIDDEN' USING ERRCODE='42501'; END IF;"""
for verb in ['faturar entregas','marcar entrega como sem cobrança']:
 a=f"""IF _entrega_id IS NULL OR NOT COALESCE(public.is_financial_staff(v_uid), false)
     OR public.h15_user_organization(v_uid) IS NULL THEN
    RAISE EXCEPTION 'Sem permissão para {verb}.' USING ERRCODE='insufficient_privilege';
  END IF;"""
 change(a,"IF _entrega_id IS NULL THEN RAISE EXCEPTION 'DELIVERY_FINANCE_FORBIDDEN' USING ERRCODE='42501'; END IF;\n  "+authority)
 a=f"""v_org := public.h15_user_organization(v_uid);
  IF v_org IS NULL OR NOT COALESCE(public.is_financial_staff(v_uid), false) THEN
    RAISE EXCEPTION 'Sem permissão para {verb}.' USING ERRCODE='insufficient_privilege';
  END IF;"""
 change(a,authority+"\n  v_initial_org := v_org;")
 a=f"""IF public.h15_user_organization(v_uid) IS DISTINCT FROM v_org
     OR NOT COALESCE(public.is_financial_staff(v_uid), false) THEN
    RAISE EXCEPTION 'Sem permissão para {verb}.' USING ERRCODE='insufficient_privilege';
  END IF;"""
 change(a,authority+"\n  IF v_org IS DISTINCT FROM v_initial_org THEN RAISE EXCEPTION 'DELIVERY_FINANCE_FORBIDDEN' USING ERRCODE='42501'; END IF;",2)
change('v_org uuid;', 'v_org uuid; v_initial_org uuid; v_ar public.accounts_receivable%ROWTYPE;',2)
change("-- replay: only inside the caller tenant (row already scoped)\n  IF v_entrega.receivable_id IS NOT NULL THEN\n    RETURN v_entrega.receivable_id;\n  END IF;", """-- Do not infer supplier-finance authority from B2B roles or order linkage.
  IF v_entrega.partner_order_id IS NOT NULL OR v_entrega.ordem_servico_onfarm_id IS NOT NULL THEN
    RAISE EXCEPTION 'DELIVERY_FINANCE_ORIGIN_UNREVIEWED' USING ERRCODE='42501';
  END IF;
  IF v_entrega.cliente_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.clientes c
    WHERE c.id=v_entrega.cliente_id AND c.organization_id=v_org) THEN
    RAISE EXCEPTION 'DELIVERY_FINANCE_FORBIDDEN' USING ERRCODE='42501';
  END IF;
  -- A stale/foreign link must never be returned as a successful replay.
  IF v_entrega.receivable_id IS NOT NULL THEN
    SELECT * INTO v_ar FROM public.accounts_receivable
     WHERE id=v_entrega.receivable_id AND organization_id=v_org
       AND origin_type='DELIVERY' AND origin_id=_entrega_id
       AND customer_id=v_entrega.cliente_id AND status<>'CANCELED';
    IF NOT FOUND THEN RAISE EXCEPTION 'DELIVERY_RECEIVABLE_LINK_INVALID' USING ERRCODE='PT409'; END IF;
    IF _payload IS NULL OR jsonb_typeof(_payload)<>'object'
      OR round((_payload->>'total_amount')::numeric,2) IS DISTINCT FROM v_ar.total_amount
      OR NULLIF(_payload->>'category_id','')::uuid IS DISTINCT FROM v_ar.category_id
      OR NULLIF(_payload->>'payment_method_id','')::uuid IS DISTINCT FROM v_ar.payment_method_id
      OR COALESCE((_payload->>'installment_count')::int,1) IS DISTINCT FROM v_ar.installment_count
      OR COALESCE((_payload->>'issue_date')::date,v_ar.issue_date) IS DISTINCT FROM v_ar.issue_date
      OR COALESCE((_payload->>'first_due_date')::date,v_ar.first_due_date) IS DISTINCT FROM v_ar.first_due_date
      OR NULLIF(_payload->>'cost_center_id','')::uuid IS DISTINCT FROM v_ar.cost_center_id
      OR COALESCE((_payload->>'fiscal_invoice_required')::boolean,false) IS DISTINCT FROM v_ar.fiscal_invoice_required
      OR (_payload ? 'installments' AND jsonb_typeof(_payload->'installments') NOT IN ('array','null'))
      OR (CASE WHEN jsonb_typeof(_payload->'installments')='array' AND jsonb_array_length(_payload->'installments')>0 THEN
        jsonb_array_length(_payload->'installments')<>v_ar.installment_count
        OR (SELECT count(DISTINCT (x->>'installment_number')::int) FROM jsonb_array_elements(_payload->'installments') x)<>v_ar.installment_count
        OR EXISTS(SELECT 1 FROM jsonb_array_elements(_payload->'installments') x WHERE (x->>'installment_number')::int NOT BETWEEN 1 AND v_ar.installment_count)
        OR EXISTS(SELECT 1 FROM jsonb_array_elements(_payload->'installments') x FULL JOIN
          (SELECT installment_number,due_date,original_amount FROM public.accounts_receivable_installments
            WHERE receivable_id=v_ar.id AND organization_id=v_org) i
          ON i.installment_number=(x->>'installment_number')::int
          WHERE i.installment_number IS NULL OR x IS NULL OR i.due_date IS DISTINCT FROM (x->>'due_date')::date
            OR i.original_amount IS DISTINCT FROM (x->>'amount')::numeric) ELSE false END) THEN
      RAISE EXCEPTION 'DELIVERY_REPLAY_INTENT_CONFLICT' USING ERRCODE='PT409';
    END IF;
    RETURN v_ar.id;
  END IF;
  IF EXISTS(SELECT 1 FROM public.accounts_receivable WHERE origin_type='DELIVERY'
     AND origin_id=_entrega_id AND status<>'CANCELED') THEN
    RAISE EXCEPTION 'DELIVERY_RECEIVABLE_LINK_INVALID' USING ERRCODE='PT409';
  END IF;""")
change("v_total_raw = 'NaN'::numeric", "v_total_raw::text IN ('NaN','Infinity','-Infinity')")
change("v_amt = 'NaN'::numeric", "v_amt::text IN ('NaN','Infinity','-Infinity')")
change("WHERE id = v_category AND active IS TRUE AND type = 'RECEITA')", "WHERE id = v_category AND active IS TRUE AND type = 'RECEITA' FOR SHARE)")
change("WHERE id = v_payment_method AND active IS TRUE)", "WHERE id = v_payment_method AND active IS TRUE FOR SHARE)")
change('  IF v_count < 1 OR v_count > 36 THEN', """  IF v_cost_center IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.financial_cost_centers
    WHERE id=v_cost_center AND active IS TRUE FOR SHARE) THEN
    RAISE EXCEPTION 'Centro de custo ativo não encontrado.' USING ERRCODE='23514';
  END IF;
  IF v_count < 1 OR v_count > 36 THEN""")
change("IF v_canon_valor IS NOT NULL THEN\n    IF abs", "IF v_canon_valor IS NOT NULL THEN\n    IF v_canon_valor::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Valor canônico inválido.' USING ERRCODE='23514'; END IF;\n    IF abs")
change("origin_type, origin_id, customer_id, description, category_id, cost_center_id,", "organization_id, origin_type, origin_id, customer_id, description, category_id, cost_center_id,")
change("'DELIVERY', _entrega_id, v_entrega.cliente_id, v_desc, v_category, v_cost_center,", "v_org, 'DELIVERY', _entrega_id, v_entrega.cliente_id, v_desc, v_category, v_cost_center,")
a=s[s.index('  EXCEPTION WHEN unique_violation THEN'):s.index('  UPDATE public.entregas')]
change(a,"""  EXCEPTION WHEN unique_violation THEN
    -- Never use a broad unique_violation as authority to return another title.
    RAISE EXCEPTION 'Entrega já possui conta a receber ativa.' USING ERRCODE='PT409';
  END;
  SELECT * INTO v_ar FROM public.accounts_receivable WHERE id=v_receivable_id
    AND organization_id=v_org AND origin_type='DELIVERY' AND origin_id=_entrega_id
    AND customer_id=v_entrega.cliente_id AND status<>'CANCELED';
  IF NOT FOUND THEN RAISE EXCEPTION 'DELIVERY_RECEIVABLE_LINK_INVALID' USING ERRCODE='PT409'; END IF;
  -- Existing canonical trigger owns initial installments. Never DELETE/reinsert immutable history.
  IF (SELECT count(*) FROM public.accounts_receivable_installments WHERE receivable_id=v_ar.id
       AND organization_id=v_org) <> v_count
    OR EXISTS(SELECT 1 FROM public.accounts_receivable_installments WHERE receivable_id=v_ar.id AND organization_id=v_org
       AND (original_amount IS NULL OR original_amount::text IN ('NaN','Infinity','-Infinity') OR original_amount<=0
            OR due_date IS NULL OR due_date<v_issue))
    OR (SELECT sum(original_amount) FROM public.accounts_receivable_installments WHERE receivable_id=v_ar.id
       AND organization_id=v_org) IS DISTINCT FROM v_total THEN
    RAISE EXCEPTION 'DELIVERY_INSTALLMENT_SNAPSHOT_INVALID' USING ERRCODE='23514';
  END IF;
  IF v_installments IS NOT NULL AND jsonb_typeof(v_installments)='array' AND jsonb_array_length(v_installments)>0
    AND EXISTS(SELECT 1 FROM jsonb_array_elements(v_installments) x FULL JOIN
      (SELECT installment_number,due_date,original_amount FROM public.accounts_receivable_installments
        WHERE receivable_id=v_ar.id AND organization_id=v_org) i
      ON i.installment_number=(x->>'installment_number')::int
      WHERE i.installment_number IS NULL OR x IS NULL OR i.due_date IS DISTINCT FROM (x->>'due_date')::date
        OR i.original_amount IS DISTINCT FROM (x->>'amount')::numeric) THEN
    RAISE EXCEPTION 'DELIVERY_CUSTOM_SCHEDULE_REVIEW_PENDING' USING ERRCODE='PT409';
  END IF;

""")
change("  IF v_entrega.receivable_id IS NOT NULL THEN\n    RAISE EXCEPTION 'Entrega já foi faturada.'", """  IF v_entrega.partner_order_id IS NOT NULL OR v_entrega.ordem_servico_onfarm_id IS NOT NULL
    OR v_entrega.cliente_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.clientes c
       WHERE c.id=v_entrega.cliente_id AND c.organization_id=v_org) THEN
    RAISE EXCEPTION 'DELIVERY_FINANCE_FORBIDDEN' USING ERRCODE='42501';
  END IF;
  IF v_entrega.receivable_id IS NOT NULL OR EXISTS(SELECT 1 FROM public.accounts_receivable
     WHERE origin_type='DELIVERY' AND origin_id=_entrega_id AND status<>'CANCELED') THEN
    RAISE EXCEPTION 'Entrega já foi faturada.'""")
change("  UPDATE public.entregas\n    SET financial_status = 'NOT_BILLABLE',", """  IF v_entrega.financial_status='NOT_BILLABLE' THEN
    IF btrim(v_entrega.not_billable_reason) IS NOT DISTINCT FROM btrim(_reason) THEN RETURN; END IF;
    RAISE EXCEPTION 'DELIVERY_NOT_BILLABLE_INTENT_CONFLICT' USING ERRCODE='PT409';
  END IF;
  IF v_entrega.status<>'entregue' OR v_entrega.financial_status='BILLED' THEN
    RAISE EXCEPTION 'DELIVERY_NOT_BILLABLE_STATE_CONFLICT' USING ERRCODE='PT409';
  END IF;
  UPDATE public.entregas
    SET financial_status = 'NOT_BILLABLE',""")
change('not_billable_reason = _reason','not_billable_reason = btrim(_reason)')
change("  -- H6-003 canonical value (unchanged logic)", "  "+authority+"\n  IF v_org IS DISTINCT FROM v_initial_org THEN RAISE EXCEPTION 'DELIVERY_FINANCE_FORBIDDEN' USING ERRCODE='42501'; END IF;\n  -- H6-003 canonical value (unchanged logic)")
change("  IF v_uid IS NULL THEN", "  IF current_setting('transaction_isolation') <> 'read committed' THEN RAISE EXCEPTION 'DELIVERY_FINANCE_ISOLATION_UNSUPPORTED' USING ERRCODE='25000'; END IF;\n  IF v_uid IS NULL THEN",2)
# Wrap final work in exactly one installation transaction; guards generated separately.
ROOT.joinpath('proposed-functions.sql.review').write_text('-- INACTIVE A2. Not a release. No GRANT.\n'+s[s.index('CREATE OR REPLACE FUNCTION'):])
live=json.loads(ROOT.joinpath('live-functions.json').read_text())
for name in ['fn_generate_receivable_from_entrega','fn_mark_entrega_not_billable']:
 old=next(x['definition'] for x in live if x['signature'].startswith('public.'+name+'('))
 new=s[s.index('CREATE OR REPLACE FUNCTION public.'+name):]
 new=new[:new.index('$function$;',new.index('AS $function$')+len('AS $function$'))+len('$function$;')]
 ROOT.joinpath(name+'.diff').write_text(''.join(difflib.unified_diff((old+';\n').splitlines(True),new.splitlines(True),fromfile='LIVE/'+name,tofile='A2-INACTIVE/'+name)))
print('assembled two proposed functions, no shared helper changes')
