"""Fixture fiel do PB-001042 no espelho descartável, somente por entradas reais (writers canônicos).
Costuras declaradas (apenas neste banco descartável):
 S1 plano legado global 'Sob consulta TESTE' adotado pela empresa A (mesma costura do pacote writers-20261111);
 S2 configuração fiscal ativa da emitente desativada durante a criação (configuração, nunca o snapshot do pedido),
    para que o writer canônico grave C2_EXTERNAL_ORDER_REQUEST_PENDING_ACCOUNTING_V1 — mesmo padrão de seller-finance-order-review.
Auth por claims SQL é sintética: não prova JWT/RLS/Storage hospedados."""
import json,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'scripts/vendedor-role-20261111/writers-20261111'))
import mirror_db
u=lambda n:f"00000000-0000-0000-0000-{n:012d}"
A='007bb519-cba0-4704-be2c-cb93ad010048';F=u(2)
P=u(11);PF=u(13)
UB,UADM,UFIN,UGC,UTEC=u(21),u(24),u(29),u(30),u(22)
UADMF=u(25)
PLQ=u(72)
ITEMS=[{"item_id":u(32),"item_tipo":"produto","packaging_id":u(51),"quantidade":2}]
QCH={"payment_method":"boleto","payment_condition_version":1,"payment_deadline_days":30}
js=lambda x:json.dumps(x).replace("'","''")
class Mirror:
    def __init__(s,port):
        s.d=mirror_db.DB(port)
    def claims(s,uid): return f"SET ROLE authenticated; SET request.jwt.claim.sub='{uid}'; SET request.jwt.claims='"+json.dumps({'sub':uid,'role':'authenticated','iat':1})+"';"
    def act(s,uid,sql,pre=''): return s.d.raw("\\set VERBOSITY verbose\n"+pre+s.claims(uid)+sql)
    def call(s,uid,expr,pre=''):
        r=s.act(uid,f"SELECT ({expr})::text;",pre)
        if r.returncode: return None,next((l for l in r.stderr.splitlines() if l.startswith('ERROR:')),r.stderr.strip()[-300:])
        lines=r.stdout.strip().splitlines();v=lines[-1] if lines else ''
        try: return json.loads(v),None
        except Exception: return (v if v else True),None
    def install_reported_stack(s):
        """Estado reportado instalado em produção: Vendedor 02a+02b+02c+02d (bytes finais, SHA conferido pelos manifestos)."""
        V=ROOT/'scripts/vendedor-role-20261111';W=V/'writers-20261111';G=W/'admin-gate-20261111'
        out={}
        import catalog_reconcile as C
        for f in (V/'02a-install-enum.sql.review',V/'02b-install.sql.review',W/'02c-install-writers.sql.review',G/'02d-install-admin-gate.sql.review'):
            if f.name.startswith('02c'):
                # Catálogo de produção 6b56cfb1 e ACL real reconstituídos pelo mesmo reconciliador do pacote writers-20261111.
                C.reconcile(s.d);C.align_acl(s.d)
                if s.d.md5(C.SIG)!=C.PROD_MD5: raise RuntimeError('CATALOG_NOT_PRODUCTION')
            b=f.read_bytes();r=s.d.raw("SET app.expected_ref='swzpzcwiasxmjutrmvkm';"+b.decode())
            if r.returncode: raise RuntimeError((f.name,r.stderr[-800:]))
            import hashlib;out[str(f.relative_to(ROOT))]=hashlib.sha256(b).hexdigest()
        return out
    def setup_quote_plan(s):
        d=s.d
        d.sql(f"SET session_replication_role=replica; UPDATE public.commercial_payment_plans SET organization_id='{A}' WHERE id='{PLQ}'; SET session_replication_role=origin;")
        r=s.call(UADM,f"public.b2b_payment_condition_publish('{PLQ}','boleto','{u(92)}','{u(97)}',30,1,0::numeric,0)")
        if r[0] is None: raise RuntimeError(('publish',r))
        r2=s.call(UADM,f"public.b2b_payment_condition_assign('{P}','{PLQ}','boleto',1,true)")
        if r2[0] is None: raise RuntimeError(('assign',r2))
        return r[0],r2[0]
    def buyer_quote_order(s,partner=P,buyer=UB,pending_accounting=True):
        d=s.d
        fs=d.last(f"SELECT coalesce(string_agg(quote_literal(id::text),','),'NULL') FROM public.company_fiscal_settings WHERE organization_id='{A}' AND is_active;")
        if pending_accounting: d.sql(f"SET session_replication_role=replica;UPDATE public.company_fiscal_settings SET is_active=false WHERE id::text IN ({fs});SET session_replication_role=origin;")
        try:
            sim,e=s.call(buyer,f"public.simulate_b2b_payment_condition_secure('{partner}','{PLQ}','{js(ITEMS)}'::jsonb,'{js(QCH)}'::jsonb)")
            if sim is None: raise RuntimeError(('sim',e))
            jr,e=s.call(buyer,f"public.recover_partner_order_attempt_v1('{partner}',NULL,NULL,false,NULL)")
            if jr and jr.get('state')=='committed':
                jr,e=s.call(buyer,f"public.recover_partner_order_attempt_v1('{partner}','{jr['key']}',{jr['generation']},true,'{jr['order_id']}')")
            if jr is None: raise RuntimeError(('attempt',e))
            c,e=s.call(buyer,f"public.create_partner_order_condition_secure('{partner}',NULL,'{js(ITEMS)}'::jsonb,NULL,'{PLQ}','{sim['cart_hash']}','{jr['key']}','{js(QCH)}'::jsonb)")
            if c is None: raise RuntimeError(('create',e))
            return c['id']
        finally:
            if pending_accounting: d.sql(f"SET session_replication_role=replica;UPDATE public.company_fiscal_settings SET is_active=true WHERE id::text IN ({fs});SET session_replication_role=origin;")
    def respond_quote(s,order,actor=UGC,price=10):
        lines=json.loads(s.d.last(f"SELECT coalesce(json_agg(json_build_object('item_id',id,'unit_price',{price}) ORDER BY id),'[]')::text FROM public.partner_order_items WHERE order_id='{order}'"))
        return s.call(actor,f"public.respond_b2b_order_quote_secure('{order}','{js(lines)}'::jsonb,NULL,NULL,NULL)")
