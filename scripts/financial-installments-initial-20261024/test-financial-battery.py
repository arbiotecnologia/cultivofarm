"""Offline only: captured LIVE bodies, synthetic Auth/price/credit/schema.
Decimal oracle is independent. FAIL is recorded, never patched into PASS.
No hosted client, DSN, network connection or candidate installation.
"""
from pathlib import Path
from decimal import Decimal as D, ROUND_HALF_UP, getcontext
from datetime import timedelta
import sys, json, hashlib, csv
sys.dont_write_bytecode = True
getcontext().prec = 60
H = Path(__file__).resolve().parent
ROOT = H.parents[1]
sys.path.insert(0, str(ROOT / 'scripts/contracts-c2-20261022/integral'))
import pg
OUT = ROOT / 'docs/auditorias/evidencias-financeiro-b2b-20261028'
LIVE = json.loads((H / 'financial-battery-live.json').read_text())
assert LIVE['ref'] == 'swzpzcwiasxmjutrmvkm'
assert pg.root.is_relative_to(Path('/tmp'))
def money(x): return D(x).quantize(D('.01'), rounding=ROUND_HALF_UP)
def uid(n): return f'00000000-0000-4000-8000-{n:012d}'
def literal(x): return "'" + str(x).replace("'", "''") + "'"
rows = []
def record(label, status, expected, actual, severity='P1', scope='PG_CORPO_REAL_DEPENDENCIAS_SINTETICAS'):
    rows.append(dict(id=f'FIN-OFF-{len(rows)+1:03}',cenario=label,status=status,
                     expectativa=expected,observado=actual,nivel=scope,severidade=severity))
    print(status, label, actual, flush=True)

# Local contracts only; no authorization claim is derived from these stubs.
SETUP = """
CREATE SCHEMA auth; CREATE SCHEMA platform_private;
CREATE TYPE app_role AS ENUM ('administrador','financeiro','gestor_comercial','parceiro_b2b','parceiro_b2b_tecnico','cliente_produtor');
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('test.uid',true),'')::uuid$$;
CREATE FUNCTION has_role(uuid,app_role) RETURNS boolean LANGUAGE sql AS $$SELECT $2::text=current_setting('test.role',true)$$;
CREATE FUNCTION get_user_partner_id() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('test.partner',true),'')::uuid$$;
CREATE FUNCTION platform_private.c2_order_actor_scope(uuid,uuid) RETURNS void LANGUAGE plpgsql AS $$BEGIN RETURN; END$$;
CREATE FUNCTION platform_private.c2_owner_order_guard(uuid,uuid,uuid) RETURNS void LANGUAGE plpgsql AS $$BEGIN RETURN; END$$;
CREATE TABLE partner_accounts(id uuid,ativo boolean); GRANT ALL ON partner_accounts TO postgres;
CREATE TABLE commercial_payment_plans(id uuid,name text,code text,active boolean,monthly_interest_percent numeric(6,3),discount_percent numeric(6,3),interest_type text,months_count numeric(6,2),max_days int,installment_count int,requires_financial_approval boolean,requires_credit_approval boolean,requires_guarantee boolean,minimum_order_amount numeric,pricing_mode text); GRANT ALL ON commercial_payment_plans TO postgres;
CREATE FUNCTION fn_b2b_plan_selectable(uuid) RETURNS boolean LANGUAGE sql AS $$SELECT true$$;
CREATE FUNCTION fn_resolve_b2b_cart(uuid,uuid,jsonb,date) RETURNS jsonb LANGUAGE sql AS $$SELECT current_setting('test.cart')::jsonb$$;
CREATE FUNCTION fn_b2b_cart_hash(uuid,uuid,jsonb,numeric) RETURNS text LANGUAGE sql AS $$SELECT 'synthetic-not-authoritative'$$;
CREATE FUNCTION fn_b2b_credit_exposure(uuid,numeric,uuid) RETURNS jsonb LANGUAGE sql AS $$SELECT '{}'::jsonb$$;
CREATE TABLE platform_private.financial_initial_installments(transaction_id bigint,title_id uuid,kind text,actor_id uuid,organization_id uuid,installments jsonb);
CREATE FUNCTION platform_private.h15_actor_organization() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('test.org',true),'')::uuid$$;
CREATE FUNCTION is_financial_staff(uuid) RETURNS boolean LANGUAGE sql AS $$SELECT true$$;
CREATE TABLE partner_orders(id uuid,payment_terms_id uuid,c2_external_origin_snapshot jsonb); GRANT ALL ON partner_orders TO postgres;
CREATE TABLE partner_order_payment_schedule(partner_order_id uuid,payment_terms_id uuid,installment_number int,due_date date,amount numeric(14,2),interest_amount numeric(14,2)); GRANT ALL ON partner_order_payment_schedule TO postgres;
CREATE TABLE accounts_receivable(id uuid,organization_id uuid,created_by uuid,origin_type text,origin_id uuid,total_amount numeric(14,2),installment_count int,first_due_date date); GRANT ALL ON accounts_receivable TO postgres;
CREATE TABLE accounts_receivable_installments(receivable_id uuid,installment_number int,due_date date,original_amount numeric(14,2),net_amount numeric(14,2),status text,organization_id uuid,interest_amount numeric(14,2) DEFAULT 0); GRANT ALL ON accounts_receivable_installments TO postgres;
"""

def main():
    OUT.mkdir(parents=True, exist_ok=True)
    pg.start(); pg.sql(SETUP)
    for name, body in LIVE['bodies'].items():
        pg.sql(body)
        signature = {'fn_b2b_apply_interest':'numeric,text,numeric,numeric',
                     'fn_generate_receivable_installments':'',
                     'simulate_b2b_payment_plan_secure':'uuid,uuid,jsonb,date'}[name]
        observed = pg.sql(f"SELECT md5(pg_get_functiondef('public.{name}({signature})'::regprocedure))")
        assert observed == LIVE['hashes'][name], (name, observed)
        record('pin '+name,'PASS',LIVE['hashes'][name],observed)
    pg.sql('CREATE TRIGGER captured_generator AFTER INSERT ON accounts_receivable FOR EACH ROW EXECUTE FUNCTION fn_generate_receivable_installments();')
    pg.sql(f"INSERT INTO partner_accounts VALUES('{uid(1)}',true);")
    today = pg.sql('SELECT current_date'); from datetime import date
    today = date.fromisoformat(today)
    cases = [
        ('a vista',0,0,'none',1,0,0,'10000.00'),
        ('30 dias',0,0,'none',1,0,30,'10000.00'),
        ('30-60-90 dias',0,0,'none',3,0,30,'10000.00'),
        ('3x simples 1%',0,1,'simple',3,3,30,'10300.00'),
        ('6x compostos 1.5%',0,'1.5','compound',6,6,30,'10934.43'),
        ('12x compostos 2%',0,2,'compound',12,12,30,'12682.42'),
        ('desconto 5% com 3x simples',5,1,'simple',3,3,30,'9785.00'),
        ('desconto 10% com 6x compostos',10,'1.5','compound',6,6,30,'9840.99'),
        ('carencia 60 dias sem mudar meses',0,1,'simple',3,3,60,'10300.00'),
    ]
    fixtures=[]
    for index,(label,discount,rate,kind,count,months,days,known) in enumerate(cases,10):
        net=money(D('10000')*(1-D(discount)/100)); r=D(rate)/100
        final=money(net*(1+r*months if kind=='simple' else (1+r)**months if kind=='compound' else 1))
        assert final == D(known), (label, final, known)
        regular=money(final/count); amounts=[regular]*(count-1)+[final-regular*(count-1)]
        expected_dates=[str(today+timedelta(days=days+30*i)) for i in range(count)]
        plan=uid(index)
        pg.sql(f"INSERT INTO commercial_payment_plans VALUES('{plan}','LOCAL','LOCAL',true,{rate},{discount},'{kind}',{months},{days},{count},false,false,false,0,'discount_from_base');")
        cart=json.dumps(dict(table_amount=10000,discount_amount=str(D('10000')-net),net_amount=str(net),lines=[],quote_required=False))
        sql=f"SELECT set_config('test.uid','{uid(100)}',false); SELECT set_config('test.role','parceiro_b2b',false); SELECT set_config('test.partner','{uid(1)}',false); SELECT set_config('test.cart',{literal(cart)},false); SELECT simulate_b2b_payment_plan_secure('{uid(1)}','{plan}','[]'::jsonb);"
        result=json.loads(pg.sql(sql).splitlines()[-1],parse_float=D)
        actual=[D(str(x['amount'])) for x in result['schedule']]
        dates=[x['due_date'] for x in result['schedule']]
        passed=D(str(result['final_amount']))==final and actual==amounts and dates==expected_dates and sum(actual)==final
        record(label,'PASS' if passed else 'FAIL',str(final),json.dumps(dict(total=str(result['final_amount']),amounts=list(map(str,actual)),dates=dates)))
        principal=sum(D(str(x['principal_amount'])) for x in result['schedule'])
        interest=sum(D(str(x['interest_amount'])) for x in result['schedule'])
        record(label+' conciliacao principal/juros','PASS' if principal==net and interest==final-net else 'FAIL',f'principal={net}; juros={final-net}',f'principal={principal}; juros={interest}')
        fixtures.append(dict(label=label,base='10000.00',discount=str(discount),rate=str(rate),method=kind,months=months,total=str(final),amounts=list(map(str,amounts)),dates=expected_dates))
        if count==3 and rate==1 and discount==0 and days==30:
            pg.sql(f"INSERT INTO partner_orders VALUES('{uid(200)}','{uid(201)}','{{}}');")
            for i,x in enumerate(result['schedule']):
                pg.sql(f"INSERT INTO partner_order_payment_schedule VALUES('{uid(200)}','{uid(201)}',{i+1},'{x['due_date']}',{x['amount']},{x['interest_amount']});")
            pg.sql(f"INSERT INTO accounts_receivable VALUES('{uid(202)}','{uid(2)}','{uid(100)}','B2B_ORDER','{uid(200)}',{final},{count},'{expected_dates[0]}');")
            actual_total=D(pg.sql(f"SELECT sum(original_amount+interest_amount) FROM accounts_receivable_installments WHERE receivable_id='{uid(202)}'"))
            record('gerador B2B + saldo original/juros','PASS' if actual_total==final else 'FAIL',str(final),str(actual_total),'P0')
    # Negative transport/domain cases against captured RPC, with stub authority explicit.
    base=uid(10)
    session=f"SELECT set_config('test.uid','{uid(100)}',false); SELECT set_config('test.role','parceiro_b2b',false); SELECT set_config('test.partner','{uid(1)}',false); SELECT set_config('test.cart',{literal(cart)},false);"
    for label,patch,token in [('taxa negativa','monthly_interest_percent=-1','invalid_interest_rate'),('desconto acima 40 gestor','discount_percent=41','discount_exceeds_limit')]:
        err=pg.sql(session+f"BEGIN; UPDATE commercial_payment_plans SET {patch} WHERE id='{base}'; SELECT simulate_b2b_payment_plan_secure('{uid(1)}','{base}','[]'::jsonb); COMMIT;",ok=False)
        assert token in err; record(label,'PASS',token,token)
    err=pg.sql(session+f"SELECT simulate_b2b_payment_plan_secure('{uid(1)}','{base}','[]'::jsonb,current_date-1);",ok=False)
    assert 'invalid_due_date' in err; record('vencimento retroativo RPC','PASS','invalid_due_date','invalid_due_date')
    # Unsupported inputs to helper must not masquerade as server-wide validation.
    negative=pg.sql("SELECT fn_b2b_apply_interest(10000,'simple',-1,3)")
    record('helper puro nao valida taxa negativa','PASS','9700.00 (validacao pertence ao chamador)',negative)
    for label,reason in [
        ('entrada 30% +3x','Sem parametro entrada na RPC B2B; 3000 +2333.33 +2333.33 +2333.34 somente referencia sem juros'),
        ('entrada 50% +2x','Sem parametro entrada; 5000 +2500 +2500 referencia sem juros, base incidencia nao contratada'),
        ('entrada maior total','Entrada nao contratada na RPC B2B'),
        ('parcelas desiguais B2B','Array customizado nao recebido pela criacao/simulacao B2B'),
        ('vencimentos personalizados/repetidos','RPC B2B recebe primeiro vencimento; demais +30 dias, sem array'),
        ('taxa excessiva servidor','UI limita 100%; maximo contratual servidor precisa matriz/constraints/resolver completos'),
        ('valor zero/parcela zero servidor','Resolver/cadeia integrais ausentes; nao certificar por cart stub'),
        ('alteracao pos-aprovacao e taxa pos-faturamento','Triggers/snapshots/cadeia completa nao carregados nesta bateria'),
        ('cancelamento apos recebivel','Contrato de cancelamento completo nao exercitado'),
        ('na_aprovacao atomicidade','Origem/contabilidade/trigger/categoria/metodo/feature instalados sem homologacao integral'),
        ('na_entrega financeiro','A2 sem instalacao/homologacao e B2B contido'),
        ('nenhum titulo pedido reprovado/CQ reprovado','Cadeia operacional/CQ/financeira completa nao exercitada'),
        ('cross tenant A/B financeiro','Auth/gates locais sinteticos nao comprovam RLS/JWT'),
        ('auditoria e conciliação persistida','Schema reduzido sem auditoria/baixa real'),
        ('mora e antecipacao automáticas','Ajustes monetarios existem; politica automatica de calculo nao comprovada'),
        ('idempotencia servidor/ACK perdido','Sem receipts/dispatch servidor completo; regressao consumidor separada'),
        ('features/plano autoridade','Stubs de seletor/gate nao comprovam entitlement instalado'),
    ]: record(label,'BLOCKED','Contrato completo instalado/comprovado',reason)
    record('JWT/browser/pagamentos/fiscal reais','NOT RUN','Autorizacao e homologacao futuras','Nenhuma sessao ou dado LIVE alterado',scope='REAL')
    (OUT/'fixtures-decimal.json').write_text(json.dumps(fixtures,indent=2)+'\n')
    (OUT/'resultados-pg.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2)+'\n')
    with (OUT/'matriz-financeira.csv').open('w') as f:
        w=csv.DictWriter(f,fieldnames=list(rows[0]));w.writeheader();w.writerows(rows)
    print('TOTAL',json.dumps({s:sum(x['status']==s for x in rows) for s in ['PASS','FAIL','BLOCKED','NOT RUN']}))

if __name__=='__main__': main()