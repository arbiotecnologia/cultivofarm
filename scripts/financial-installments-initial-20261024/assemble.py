"""Local-only composition; never connects to hosted PostgreSQL."""
from pathlib import Path
import json, hashlib, difflib
H=Path(__file__).resolve().parent
D=json.loads((H/'capture.json').read_text())
CHANGED=['rpc_create_financial_title(text,jsonb)','fn_generate_receivable_installments()','fn_generate_payable_installments()']
def literal(s): return "'"+s.replace("'","''")+"'"
def guard(post=False):
 out=['DO $guard$ BEGIN\n']
 hashes=json.loads((H/'post-hashes.json').read_text()) if post else {}
 for f in D['functions']:
  digest=hashes.get(f['signature'],f['md5'])
  out.append(f"IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure({literal('public.'+f['signature'] if not f['signature'].startswith('platform_private.') else f['signature'])}) AND md5(pg_get_functiondef(oid))={literal(digest)} AND pg_get_userbyid(proowner)={literal(f['owner'])} AND proacl::text IS NOT DISTINCT FROM {literal(f['acl'])}) THEN RAISE EXCEPTION 'FIN_INITIAL_FUNCTION_DRIFT:{f['signature']}' USING ERRCODE='42501'; END IF;\n")
 for t in D['triggers']:
  out.append(f"IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.{t['table']}'::regclass AND tgname={literal(t['name'])} AND pg_get_triggerdef(oid)={literal(t['definition'])} AND tgenabled={literal(t['enabled'])}) THEN RAISE EXCEPTION 'FIN_INITIAL_TRIGGER_DRIFT' USING ERRCODE='42501'; END IF;\n")
 for t in D['tables']:
  out.append(f"IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='public.{t['name']}'::regclass AND relrowsecurity={str(t['rls']).lower()} AND relforcerowsecurity={str(t['force']).lower()} AND relacl::text={literal(t['acl'])}) THEN RAISE EXCEPTION 'FIN_INITIAL_TABLE_DRIFT' USING ERRCODE='42501'; END IF;\n")
 for p in D['policies']:
  out.append(f"IF NOT EXISTS(SELECT 1 FROM pg_policies x WHERE to_jsonb(x)={literal(json.dumps(p))}::jsonb) THEN RAISE EXCEPTION 'FIN_INITIAL_POLICY_DRIFT' USING ERRCODE='42501'; END IF;\n")
 out.append('END $guard$;\n'); return ''.join(out)
context='''CREATE TABLE IF NOT EXISTS platform_private.financial_initial_installments (
 transaction_id bigint NOT NULL, title_id uuid NOT NULL, kind text NOT NULL,
 actor_id uuid NOT NULL, organization_id uuid NOT NULL, installments jsonb NOT NULL,
 PRIMARY KEY(transaction_id,title_id,kind)
);
REVOKE ALL ON platform_private.financial_initial_installments FROM PUBLIC,anon,authenticated,service_role;
ALTER TABLE platform_private.financial_initial_installments ENABLE ROW LEVEL SECURITY;
'''
def bodies():
 for sig in CHANGED:
  f=next(f for f in D['functions'] if f['signature']==sig); s=f['body']
  if sig.startswith('rpc_'):
   s=s.replace('v_title_id uuid;','v_title_id uuid := gen_random_uuid();')
   anchor="  IF p_kind = 'receivable' THEN\n    v_customer"
   injection="""  IF v_total * 100 < v_count THEN RAISE EXCEPTION 'FIN_TITLE_INVALID_INSTALLMENT' USING ERRCODE='23514'; END IF;
  IF NOT isfinite(v_issue) OR NOT isfinite(v_first_due) THEN RAISE EXCEPTION 'FIN_TITLE_INVALID_INSTALLMENT' USING ERRCODE='23514'; END IF;
  IF v_installments IS NOT NULL THEN
    IF EXISTS(SELECT 1 FROM jsonb_array_elements(v_installments) x WHERE NOT isfinite((x->>'due_date')::date)) THEN RAISE EXCEPTION 'FIN_TITLE_INVALID_INSTALLMENT' USING ERRCODE='23514'; END IF;
    INSERT INTO platform_private.financial_initial_installments
      VALUES(txid_current(),v_title_id,p_kind,v_uid,v_org,v_installments);
  END IF;

"""
   assert anchor in s; s=s.replace(anchor,injection+anchor)
   s=s.replace('INSERT INTO accounts_receivable (\n      organization_id','INSERT INTO accounts_receivable (\n      id, organization_id').replace('      v_org, v_customer,','      v_title_id, v_org, v_customer,')
   s=s.replace('INSERT INTO accounts_payable (\n      organization_id','INSERT INTO accounts_payable (\n      id, organization_id').replace('      v_org, v_supplier_id,','      v_title_id, v_org, v_supplier_id,')
   start=s.index('    -- Preserve generated installments;'); end=s.index('    INSERT INTO financial_audit_log',start)
   s=s[:start]+s[end:]
   s=s.replace('-- Substituir parcelas geradas pelo trigger quando o cliente envia customizadas','-- Parcelas personalizadas já inseridas inicialmente pelo trigger.')
  else:
   kind='receivable' if 'receivable' in sig else 'payable'; fk=kind+'_id'; table='accounts_'+kind+'_installments'
   s=s.replace('  i int;','  i int;\n  v_context platform_private.financial_initial_installments;\n  v_inst jsonb;')
   anchor='  FOR i IN 1..v_qtd LOOP'
   branch=f"""  DELETE FROM platform_private.financial_initial_installments
    WHERE transaction_id=txid_current() AND title_id=NEW.id AND kind='{kind}'
    RETURNING * INTO v_context;
  IF FOUND THEN
    IF v_context.actor_id IS DISTINCT FROM auth.uid() OR v_context.organization_id IS DISTINCT FROM NEW.organization_id
       OR NEW.created_by IS DISTINCT FROM v_context.actor_id OR NEW.origin_type <> 'MANUAL'
       OR platform_private.h15_actor_organization() IS DISTINCT FROM NEW.organization_id
       OR NOT public.is_financial_staff(auth.uid()) THEN
      RAISE EXCEPTION 'FIN_INITIAL_CONTEXT_DENIED' USING ERRCODE='42501';
    END IF;
    IF jsonb_array_length(v_context.installments) <> NEW.installment_count
       OR (SELECT sum((x->>'amount')::numeric) FROM jsonb_array_elements(v_context.installments) x) IS DISTINCT FROM NEW.total_amount THEN
      RAISE EXCEPTION 'FIN_TITLE_INVALID_SUM' USING ERRCODE='23514';
    END IF;
    FOR v_inst IN SELECT * FROM jsonb_array_elements(v_context.installments) LOOP
      INSERT INTO public.{table}(organization_id,{fk},installment_number,due_date,original_amount,net_amount,status)
        VALUES(NEW.organization_id,NEW.id,(v_inst->>'installment_number')::int,(v_inst->>'due_date')::date,
          (v_inst->>'amount')::numeric,(v_inst->>'amount')::numeric,'OPEN');
    END LOOP;
    RETURN NEW;
  END IF;
"""
   s=s.replace(anchor,branch+anchor)
  (H/(sig.split('(')[0]+'.sql.review')).write_text(s+';\n',newline='')
  (H/(sig.split('(')[0]+'.diff')).write_text(''.join(difflib.unified_diff(f['body'].splitlines(True),s.splitlines(True),fromfile='LIVE',tofile='candidate')))
def assemble():
 bodies()
 final=H.parent/'owner-orders-20261023/credit-numeric-20261024/final-integrated-20261024/origin/candidate.sql.review'
 source=final.read_text()
 start=source.index('CREATE OR REPLACE FUNCTION public.fn_generate_receivable_installments()')
 end=source.index('$function$;',start)+len('$function$;')
 composed=source[start:end]
 branch=composed[composed.index("  IF NEW.origin_type='B2B_ORDER'"):composed.index('  FOR i IN 1..v_qtd LOOP')]
 manual=(H/'fn_generate_receivable_installments.sql.review').read_text()
 (H/'future-composed-function.sql.review').write_text(manual.replace('  FOR i IN 1..v_qtd LOOP',branch+'  FOR i IN 1..v_qtd LOOP'))
 if not (H/'post-hashes.json').exists(): return
 pre=guard(); post=guard(True)
 private_guard="""DO $private$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='platform_private.financial_initial_installments'::regclass AND relrowsecurity AND pg_get_userbyid(relowner)='postgres' AND NOT has_table_privilege('authenticated',oid,'INSERT') AND NOT has_table_privilege('anon',oid,'INSERT') AND NOT has_table_privilege('service_role',oid,'INSERT')) THEN RAISE EXCEPTION 'FIN_INITIAL_PRIVATE_DRIFT' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM platform_private.financial_initial_installments) THEN RAISE EXCEPTION 'FIN_INITIAL_CONTEXT_NOT_EMPTY' USING ERRCODE='42501'; END IF;
END $private$;
"""
 ddl=''.join((H/(s.split('(')[0]+'.sql.review')).read_text(newline='') if False else (H/(s.split('(')[0]+'.sql.review')).read_bytes().decode() for s in CHANGED)
 (H/'preflight.sql').write_text('BEGIN READ ONLY;\n'+pre+'COMMIT;\n')
 (H/'postflight.sql').write_text('BEGIN READ ONLY;\n'+post+private_guard+'COMMIT;\n')
 (H/'candidate.sql.review').write_text('BEGIN;\n'+pre+context+ddl+post+private_guard+'COMMIT;\n',newline='')
 baseline=''.join(next(f for f in D['functions'] if f['signature']==s)['body']+';\n' for s in CHANGED)
 (H/'rollback.sql.review').write_text('BEGIN;\n'+post+private_guard+baseline+pre+'COMMIT;\n',newline='')
if __name__=='__main__': assemble()
