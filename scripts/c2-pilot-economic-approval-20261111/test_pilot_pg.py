#!/usr/bin/env python3
"""Bateria do piloto econômico C2 (PB-001042) no espelho compatível (PostgreSQL descartável, nunca hospedado).
Executa os bytes finais 01..06 conferidos contra SHA256SUMS. Auth por claims SQL é sintética: não prova JWT/RLS/Storage.
Uso: python3 test_pilot_pg.py   (requer /tmp/vendedor-mirror.dump gerado por writers-20261111/measure_live.py em cópia temporária)"""
import hashlib,importlib.util as iu,json,subprocess,sys,time,uuid
from pathlib import Path
H=Path(__file__).resolve().parent;sys.path.insert(0,str(H))
import fixture as X
sp=iu.spec_from_file_location('pilot_gen',H/'generate.py');G=iu.module_from_spec(sp);sp.loader.exec_module(G)
EV=H/'evidence';EV.mkdir(exist_ok=True)
att=EV/f"attempt-{max([int(p.name[-3:]) for p in EV.glob('attempt-*')],default=0)+1:03d}";att.mkdir()
checks=[];executed=[]
def ok(name,cond,detail=None):
    checks.append(dict(test=name,status='PASS' if cond else 'FAIL',detail=None if cond else str(detail)[:1200]))
    print(('PASS ' if cond else 'FAIL ')+name,'' if cond else str(detail)[:500],flush=True)
SUMS={l.split()[1]:l.split()[0] for l in (H/'SHA256SUMS').read_text().splitlines()}
m=X.Mirror(55821);d=m.d;js=X.js
REF="SET c2pilot.expected_ref='swzpzcwiasxmjutrmvkm';"
def run_file(n,pre=REF):
    b=(H/n).read_bytes();s=hashlib.sha256(b).hexdigest()
    assert s==SUMS[n],('SHA_MISMATCH',n);executed.append(dict(file=n,sha256=s));return d.raw(pre+b.decode())
T=lambda t: d.last(f"SELECT to_regclass('{t}') IS NOT NULL")=='t'
def fp():
    parts=["(SELECT md5(coalesce(string_agg(to_jsonb(x)::text,',' ORDER BY x.id),'')) FROM public.partner_orders x)",
     "(SELECT md5(coalesce(string_agg(to_jsonb(x)::text,',' ORDER BY x.id),'')) FROM public.partner_order_payment_terms x)",
     "(SELECT md5(coalesce(string_agg(to_jsonb(x)::text,',' ORDER BY x.id),'')) FROM public.partner_order_payment_schedule x)",
     "(SELECT md5(coalesce(string_agg(to_jsonb(x)::text,',' ORDER BY x.id),'')) FROM public.partner_order_items x)",
     "(SELECT count(*) FROM platform_private.b2b_order_condition_quote_snapshots)","(SELECT count(*) FROM public.partner_order_audit_logs)",
     "(SELECT count(*) FROM platform_private.b2b_financial_forecasts)","(SELECT count(*) FROM platform_private.b2b_financial_forecast_events)",
     "(SELECT count(*) FROM platform_private.authz_tickets)","(SELECT count(*) FROM public.accounts_receivable)","(SELECT count(*) FROM public.fiscal_invoices)",
     "(SELECT count(*) FROM public.estoque_movimentacoes)","(SELECT count(*) FROM public.entregas)","(SELECT count(*) FROM public.notificacoes_operacionais)"]
    for t in ('public.comunicacao_outbox','public.communication_outbox','public.fiscal_events','public.accounts_receivable_installments'):
        if T(t): parts.append(f"(SELECT count(*) FROM {t})")
    if T('platform_private.c2_pilot_econ_approvals_v1'): parts+=["(SELECT count(*) FROM platform_private.c2_pilot_econ_approvals_v1)","(SELECT count(*)||':'||count(revoked_at) FROM platform_private.c2_pilot_econ_allowlist_v1)"]
    return d.last("SELECT md5(concat_ws('|',"+",".join(parts)+"))")
def deny(name,thunk,state,tok):
    b=fp();r=thunk();a=fp();err=r[1] or ''
    okc=r[0] is None and f'{state}:' in err and tok in err and a==b
    ok(f'{name} [{state} {tok}]',okc,dict(result=r,effects_changed=a!=b))
def row(o): return d.last(f"SELECT md5(to_jsonb(po)::text) FROM public.partner_orders po WHERE id='{o}'")
def cnt(sql): return int(d.last(sql))
def nf(o): return cnt(f"SELECT count(*) FROM platform_private.b2b_financial_forecasts WHERE order_id='{o}'")
def nev(o): return cnt(f"SELECT count(*) FROM platform_private.b2b_financial_forecast_events e JOIN platform_private.b2b_financial_forecasts f ON f.id=e.forecast_id WHERE f.order_id='{o}'")
def evh(o): return json.loads(d.last(f"SELECT platform_private.c2_pilot_econ_evidence_v1('{o}')::text"))['evidence_hash']
key=lambda: 'k-'+uuid.uuid4().hex
ap=lambda uid,o,kind,k,h: m.call(uid,f"public.c2_pilot_economic_approve_v1('{o}','{kind}','{k}','{h}','aprovacao explicita piloto')")
st=lambda uid,o: m.call(uid,f"public.c2_pilot_economic_state_v1('{o}')")
def enable(o,ca=X.UGC,ka=X.UFIN,h=4):
    return run_file('05-pilot-enable.sql.review',REF+f"SET c2pilot.order_id='{o}';SET c2pilot.commercial_actor='{ca}';SET c2pilot.credit_actor='{ka}';SET c2pilot.hours='{h}';SET c2pilot.reason='PILOTO PB-001042 ESPELHO';")
def sess(uid,body):
    p=subprocess.Popen(d.psql(),stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
    p.stdin.write(m.claims(uid)+body+"\n");p.stdin.close();return p
def jl(out): 
    l=[x for x in out.splitlines() if x.startswith('{')];return json.loads(l[-1]) if l else None
VEND=X.u(931)
try:
    ok('restore sem erros além das FKs auth conhecidas',all('foreign key' in x for x in d.restore_errors),d.restore_errors)
    stack=m.install_reported_stack();ok('estado reportado de produção: Vendedor 02a/02b/02c/02d aplicados (bytes finais)',len(stack)==4,stack)
    for s,h in G.DEPS.items(): ok('dependência = pin '+s,d.md5(s)==h,d.md5(s))
    # Alinhamento declarado com produção: criação de previsão global OFF.
    d.sql("UPDATE platform_private.b2b_forecast_creation_gate_v1 SET enabled=false,reason='PRODUCTION_ALIGNED_OFF' WHERE singleton;")
    d.sql(f"INSERT INTO public.profiles(id,user_id,nome,ativo,organization_id,senha_provisoria) VALUES(gen_random_uuid(),'{VEND}','VENDEDOR SINTETICO',true,'{X.A}',false);INSERT INTO public.user_roles(user_id,role) VALUES('{VEND}','vendedor');")
    m.setup_quote_plan()
    O=[]
    for i in range(7):
        o=m.buyer_quote_order();r=m.respond_quote(o);O.append(o)
        if i==0: ok('fixture: resposta cotada pelo writer real',r[0] is not None,r)
    O7=m.buyer_quote_order()  # não respondido
    s=d.sql(f"SELECT status||'|'||(c2_external_origin_snapshot->>'contract')||'|'||(c2_external_origin_snapshot->>'accounting_validated')||'|'||total||'|'||coalesce(internal_economic_snapshot::text,'null')||'|'||payment_condition_status||'|'||(SELECT approval_status FROM public.partner_order_payment_terms t WHERE t.id=po.payment_terms_id) FROM public.partner_orders po WHERE id='{O[0]}'")
    ok('pedido fiel ao PB-001042: em_analise_comercial, C2 pendente contábil, total 20, snapshot econômico nulo, condição definida',s=='em_analise_comercial|C2_EXTERNAL_ORDER_REQUEST_PENDING_ACCOUNTING_V1|false|20.00|null|defined|not_required',s)
    q=d.sql(f"SELECT condition_method||'|'||due_basis||'|'||estimated||'|'||principal||'|'||financed_total||'|'||jsonb_array_length(rows) FROM platform_private.b2b_order_condition_quote_snapshots WHERE order_id='{O[0]}'")
    it=d.sql(f"SELECT count(*)||'|'||sum(quantidade)||'|'||max(preco_unitario)||'|'||max(packaging_peso_liquido_kg_snapshot) FROM public.partner_order_items WHERE order_id='{O[0]}'")
    ok('cotação: boleto, due_basis nf_issue, estimado, principal=total=20, 1 parcela',q=='boleto|nf_issue|true|20.00|20.00|1',q)
    ok('itens: 1 linha, 2 embalagens inteiras de 25 kg a R$10',it.split('|')[0]=='1' and float(it.split('|')[1])==2 and float(it.split('|')[2])==10 and float(it.split('|')[3] or 0)==25,it)
    ok('evento quote_responded único no histórico',cnt(f"SELECT count(*) FROM public.partner_order_audit_logs WHERE order_id='{O[0]}' AND acao='quote_responded'")==1)
    deny('LIVE approve_partner_order bloqueado para o contrato C2',lambda: m.call(X.UGC,f"public.approve_partner_order('{O[0]}',NULL)"),'42501','C2_ACCOUNTING_PENDING')
    deny('LIVE approve_b2b_credit bloqueado para o contrato C2',lambda: m.call(X.UFIN,f"public.approve_b2b_credit('{O[0]}',NULL)"),'42501','C2_ACCOUNTING_PENDING')
    # PRE / INSTALL / POST
    r=run_file('01-pre.sql.readonly',"SET c2pilot.expected_ref='wrong';");ok('PRE ref divergente falha fechada',r.returncode!=0 and 'C2PILOT_PRE_REF_UNPROVEN' in r.stderr,r.stderr[-300:])
    r=run_file('01-pre.sql.readonly');ok('PRE_PASS',r.returncode==0 and 'C2PILOT_PRE_PASS' in r.stdout,r.stderr[-400:])
    r=run_file('02-install.sql.review',"SET c2pilot.expected_ref='wrong';");ok('INSTALL sem ref recusado',r.returncode!=0 and 'REF_UNPROVEN' in r.stderr)
    EFF0={t:cnt(f"SELECT count(*) FROM {t}") for t in ('public.accounts_receivable','public.fiscal_invoices','public.estoque_movimentacoes','public.entregas','public.notificacoes_operacionais')+tuple(t for t in ('public.comunicacao_outbox','public.communication_outbox','public.fiscal_events','public.accounts_receivable_installments') if T(t))};F0=cnt('SELECT count(*) FROM platform_private.b2b_financial_forecasts');E0=cnt('SELECT count(*) FROM platform_private.b2b_financial_forecast_events')
    b0=fp();r=run_file('02-install.sql.review');ok('INSTALL transação única',r.returncode==0,r.stderr[-1200:])
    r=run_file('03-post.sql.readonly');ok('POST_PASS',r.returncode==0 and 'C2PILOT_POST_PASS' in r.stdout,r.stderr[-400:])
    r=run_file('02-install.sql.review');ok('reinstalação recusada',r.returncode!=0 and 'C2PILOT_INSTALL_ALREADY_PRESENT' in r.stderr,r.stderr[-200:])
    for s,h in G.DEPS.items(): ok('pós-instalação: corpo LIVE intocado '+s,d.md5(s)==h)
    ok('instalado fechado: gate false, allowlist vazia',d.last("SELECT enabled::text||(SELECT count(*) FROM platform_private.c2_pilot_econ_allowlist_v1) FROM platform_private.c2_pilot_econ_gate_v1")=='false0')
    H0=evh(O[0])
    v,e=st(X.UGC,O[0]);ok('fechado: leitor informa piloto desligado, sem evidência e sem ação',v and v['pilot_enabled'] is False and v['evidence'] is None and v['can_approve_commercial'] is False,v or e)
    deny('fechado: aprovação comercial recusada',lambda: ap(X.UGC,O[0],'commercial',key(),H0),'42501','C2_PILOT_ECON_DISABLED')
    # Habilitação separada
    r=enable(O[0],ca=VEND);ok('habilitação recusa vendedor como aprovador comercial',r.returncode!=0 and 'C2PILOT_ENABLE_COMMERCIAL_ACTOR_INVALID' in r.stderr,r.stderr[-300:])
    r=enable(O[0],ka=X.UGC);ok('habilitação recusa gestor comercial como aprovador de crédito',r.returncode!=0 and 'C2PILOT_ENABLE_CREDIT_ACTOR_INVALID' in r.stderr,r.stderr[-300:])
    r=enable(O[0],h=48);ok('habilitação recusa validade > 24h',r.returncode!=0 and 'C2PILOT_ENABLE_PARAMS_REQUIRED' in r.stderr)
    r=enable(O7);ok('habilitação recusa pedido sem resposta cotada (falha fechada)',r.returncode!=0 and 'C2_PILOT_ECON_EVIDENCE_INCOMPLETE' in r.stderr,r.stderr[-300:])
    r=run_file('05-pilot-enable.sql.review');ok('habilitação sem parâmetros recusada',r.returncode!=0 and 'C2PILOT_ENABLE_PARAMS_REQUIRED' in r.stderr)
    for o in O[:6]:
        r=enable(o);ok(f'habilitação estreita do pedido {o[:8]}',r.returncode==0 and 'C2PILOT_ENABLE_PASS' in r.stdout,r.stderr[-400:])
    v,e=st(X.UGC,O[0]);ok('UGC: evidência completa, pode aprovar comercial e não crédito',v and v['evidence'] and v['evidence']['evidence_hash']==H0 and v['can_approve_commercial'] is True and v['can_approve_credit'] is False,v or e)
    v,e=st(X.UFIN,O[0]);ok('Financeiro: pode aprovar crédito e não comercial',v and v['can_approve_credit'] is True and v['can_approve_commercial'] is False,v or e)
    v,e=st(X.UADM,O[0]);ok('admin sem concessão: lê estado, sem evidência nem ação',v and v['evidence'] is None and not v['can_approve_commercial'] and not v['can_approve_credit'],v or e)
    for lbl,uid,tok in (('comprador',X.UB,'C2_PILOT_ECON_DENIED:role'),('vendedor',VEND,'C2_PILOT_ECON_DENIED:role'),('técnico externo',X.UTEC,'C2_PILOT_ECON_DENIED:role'),('admin de outro tenant',X.UADMF,'C2_PILOT_ECON_DENIED:scope')):
        deny(f'leitor nega {lbl}',lambda uid=uid: st(uid,O[0]),'42501',tok)
    # Negativas da aprovação
    for lbl,uid,kind,tok in (('comprador',X.UB,'commercial','C2_PILOT_ECON_DENIED:role'),('vendedor',VEND,'commercial','C2_PILOT_ECON_DENIED:role'),
                             ('Financeiro como comercial',X.UFIN,'commercial','C2_PILOT_ECON_DENIED:role'),('gestor comercial como crédito',X.UGC,'credit','C2_PILOT_ECON_DENIED:role'),
                             ('admin de outro tenant',X.UADMF,'commercial','C2_PILOT_ECON_DENIED:scope'),('admin do tenant sem concessão',X.UADM,'commercial','C2_PILOT_ECON_NOT_GRANTED')):
        deny(f'aprovação negada: {lbl}',lambda uid=uid,kind=kind: ap(uid,O[0],kind,key(),H0),'42501',tok)
    deny('hash de evidência divergente',lambda: ap(X.UGC,O[0],'commercial',key(),'0'*32),'PT409','C2_PILOT_ECON_EVIDENCE_CHANGED')
    deny('chave curta',lambda: ap(X.UGC,O[0],'commercial','curta',H0),'22023','C2_PILOT_ECON_KEY_INVALID')
    deny('tipo inválido',lambda: ap(X.UGC,O[0],'fiscal',key(),H0),'22023','C2_PILOT_ECON_KIND_INVALID')
    deny('concessão de O1 não vale para O7',lambda: ap(X.UGC,O7,'commercial',key(),H0),'42501','C2_PILOT_ECON_NOT_GRANTED')
    # Evidência incompleta (mutações só em transação revertida, como fixture negativa)
    for lbl,mut,tok in (('snapshot da cotação ausente',f"DELETE FROM platform_private.b2b_order_condition_quote_snapshots WHERE order_id='{O[0]}';",'quote_snapshot'),
                        ('evento quote_responded ausente',f"DELETE FROM public.partner_order_audit_logs WHERE order_id='{O[0]}' AND acao='quote_responded';",'quote_event'),
                        ('meio de pagamento inativo',f"UPDATE public.payment_methods SET active=false WHERE id='{X.u(92)}';",'payment_method'),
                        ('cronograma divergente',f"UPDATE public.partner_order_payment_schedule SET amount=19 WHERE partner_order_id='{O[0]}';",'schedule'),
                        ('termos rejeitados',f"UPDATE public.partner_order_payment_terms SET approval_status='rejected' WHERE partner_order_id='{O[0]}';",'TERMS_NOT_SETTLED'),
                        ('parceiro inativo',f"UPDATE public.partner_accounts SET ativo=false WHERE id='{X.P}';",'scope')):
        r=m.act(X.UGC,f"SELECT public.c2_pilot_economic_approve_v1('{O[0]}','commercial','{key()}','{H0}',NULL); ROLLBACK;","BEGIN; SET LOCAL session_replication_role=replica;"+mut+"SET LOCAL session_replication_role=origin;")
        ok(f'evidência incompleta falha fechada: {lbl}',r.returncode!=0 and tok in r.stderr,r.stderr[-300:])
    ok('negativas sem efeitos persistidos',nf(O[0])==0 and cnt("SELECT count(*) FROM platform_private.c2_pilot_econ_approvals_v1")==0)
    # Matriz 00 -> 10 -> 11 (O1) e 00 -> 01 -> 11 (O2)
    R=[row(o) for o in O]
    v,_=st(X.UGC,O[0]);ok('00: sem aprovações e sem previsão',v['approvals']==[] and v['forecast'] is None)
    k1=key();a,e=ap(X.UGC,O[0],'commercial',k1,H0)
    ok('10: aprovação comercial explícita com autor/data, sem previsão',a and a['approved_by']==X.UGC and a['approved_at'] and a['forecast_id'] is None and nf(O[0])==0,a or e)
    a2,e=ap(X.UGC,O[0],'commercial',k1,H0);ok('10: replay mesma chave devolve o mesmo registro',a2 and a2['replayed'] and a2['approval_id']==a['approval_id'],a2 or e)
    deny('10: segunda aprovação comercial (outra chave)',lambda: ap(X.UGC,O[0],'commercial',key(),H0),'PT409','C2_PILOT_ECON_ALREADY_APPROVED')
    deny('10: chave reaproveitada para crédito',lambda: ap(X.UFIN,O[0],'credit',k1,H0),'PT409','C2_PILOT_ECON_IDEMPOTENCY_CONFLICT')
    deny('10: LIVE approve_b2b_credit continua bloqueado',lambda: m.call(X.UFIN,f"public.approve_b2b_credit('{O[0]}',NULL)"),'42501','C2_ACCOUNTING_PENDING')
    k2=key();b,e=ap(X.UFIN,O[0],'credit',k2,H0)
    ok('11: crédito explícito cria exatamente uma previsão e um evento',b and b['forecast_id'] and nf(O[0])==1 and nev(O[0])==1,b or e)
    b2,e=ap(X.UFIN,O[0],'credit',k2,H0);ok('11: replay devolve a mesma previsão, sem duplicar',b2 and b2['replayed'] and b2['forecast_id']==b['forecast_id'] and nf(O[0])==1 and nev(O[0])==1,b2 or e)
    fr=json.loads(d.last(f"SELECT jsonb_build_object('t',total_amount,'r',residual_amount,'s',state,'cb',commercial_approved_by,'kb',credit_approved_by,'src',economic_snapshot->>'source','cs',credit_decision_snapshot->>'source','rc',credit_decision_snapshot ? 'reason_code','sch',schedule_snapshot)::text FROM platform_private.b2b_financial_forecasts WHERE order_id='{O[0]}'"))
    ok('previsão: total 20 não exigível (aguardando_fiscal), autores explícitos, crédito sem reason_code automático',fr['t']==20 and fr['r']==20 and fr['s']=='aguardando_fiscal' and fr['cb']==X.UGC and fr['kb']==X.UFIN and fr['src']=='C2_PILOT_ECONOMIC_APPROVAL_V1' and fr['cs']=='C2_PILOT_EXPLICIT_CREDIT_APPROVAL_V1' and fr['rc'] is False and len(fr['sch'])==1,fr)
    deny('11: LIVE approve_partner_order continua bloqueado',lambda: m.call(X.UGC,f"public.approve_partner_order('{O[0]}',NULL)"),'42501','C2_ACCOUNTING_PENDING')
    k3=key();c,e=ap(X.UFIN,O[1],'credit',k3,evh(O[1]));ok('01: crédito antes do comercial, sem previsão',c and c['forecast_id'] is None and nf(O[1])==0,c or e)
    c2,e=ap(X.UGC,O[1],'commercial',key(),evh(O[1]));ok('01→11: comercial depois cria uma previsão e um evento',c2 and c2['forecast_id'] and nf(O[1])==1 and nev(O[1])==1,c2 or e)
    ok('pedidos inalterados (status/aprovações/snapshot/flags) após 10/01/11',[row(o) for o in O]==R)
    v,_=st(X.UFIN,O[0]);ok('leitor: duas aprovações com autor/data e previsão; operação/fiscal/cobrança/envio bloqueados',len(v['approvals'])==2 and v['forecast'] and v['forecast']['total_amount']==20 and all(v[k] for k in ('operational_blocked','fiscal_blocked','billing_blocked','shipping_blocked')) and not v['can_approve_credit'],v)
    # Concorrência
    d.sql("SELECT 1");ap(X.UGC,O[2],'commercial',key(),evh(O[2]))
    ks=key();h2=evh(O[2]);body=f"SELECT public.c2_pilot_economic_approve_v1('{O[2]}','credit','{ks}','{h2}',NULL)::text;"
    pa=sess(X.UFIN,"BEGIN;"+body+"SELECT pg_sleep(1.5);COMMIT;");time.sleep(0.4);pb=sess(X.UFIN,body)
    oa,ea=pa.communicate(timeout=60);ob,eb=pb.communicate(timeout=60);ja,jb=jl(oa),jl(ob)
    ok('concorrência mesma chave: mesmo registro, uma previsão e um evento',pa.returncode==0 and pb.returncode==0 and ja and jb and ja['approval_id']==jb['approval_id'] and ja['forecast_id']==jb['forecast_id'] and nf(O[2])==1 and nev(O[2])==1,(ea[-300:],eb[-300:]))
    h3=evh(O[3])
    pa=sess(X.UGC,f"BEGIN;SELECT public.c2_pilot_economic_approve_v1('{O[3]}','commercial','{key()}','{h3}',NULL)::text;SELECT pg_sleep(1.5);COMMIT;");time.sleep(0.4)
    pb=sess(X.UFIN,f"SELECT public.c2_pilot_economic_approve_v1('{O[3]}','credit','{key()}','{h3}',NULL)::text;")
    oa,ea=pa.communicate(timeout=60);ob,eb=pb.communicate(timeout=60);ja,jb=jl(oa),jl(ob)
    ok('concorrência comercial×crédito em conexões distintas: ambos gravam, exatamente uma previsão e um evento',pa.returncode==0 and pb.returncode==0 and ja and jb and (ja['forecast_id'] is None)!=(jb['forecast_id'] is None) and nf(O[3])==1 and nev(O[3])==1,(oa[-200:],ea[-300:],ob[-200:],eb[-300:]))
    ap(X.UGC,O[4],'commercial',key(),evh(O[4]));h4=evh(O[4])
    pa=sess(X.UFIN,f"BEGIN;SELECT public.c2_pilot_economic_approve_v1('{O[4]}','credit','{key()}','{h4}',NULL)::text;SELECT pg_sleep(1.5);COMMIT;");time.sleep(0.4)
    pb=sess(X.UFIN,f"\\set VERBOSITY verbose\nSELECT public.c2_pilot_economic_approve_v1('{O[4]}','credit','{key()}','{h4}',NULL)::text;")
    oa,ea=pa.communicate(timeout=60);ob,eb=pb.communicate(timeout=60)
    ok('concorrência chaves distintas: um grava, outro PT409 ALREADY_APPROVED; uma previsão/um evento',pa.returncode==0 and pb.returncode!=0 and 'C2_PILOT_ECON_ALREADY_APPROVED' in eb and nf(O[4])==1 and nev(O[4])==1,(ea[-200:],eb[-300:]))
    # Núcleo legado / qualquer entrada
    r=d.raw(f"SELECT platform_private.b2b_financial_forecast_after_approval_v1('{O[5]}','{{\"reason_code\":\"OK\"}}'::jsonb)::text;")
    ok('núcleo legado com reason_code OK não cria previsão para pedido do piloto',r.returncode==0 and nf(O[5])==0,r.stdout[-200:]+r.stderr[-200:])
    d.sql("UPDATE platform_private.b2b_forecast_creation_gate_v1 SET enabled=true WHERE singleton;")
    ins=lambda o: f"INSERT INTO platform_private.b2b_financial_forecasts(order_id,organization_id,partner_id,total_amount,residual_amount,state,economic_snapshot,schedule_snapshot,items_snapshot,credit_decision_snapshot,commercial_approved_by,commercial_approved_at) VALUES('{o}','{X.A}','{X.P}',20,20,'aguardando_fiscal','{{}}','[]','[]','{{\"reason_code\":\"OK\"}}','{X.UGC}',now());"
    r=d.raw(ins(O[5]));ok('inserção direta privilegiada (reason_code OK, sem assinatura) negada mesmo com gate global aberto',r.returncode!=0 and 'C2_PILOT_FORECAST_ENTRY_DENIED' in r.stderr,r.stderr[-200:])
    r=d.raw(f"BEGIN;INSERT INTO platform_private.authz_tickets(txid,scope,target) VALUES(txid_current(),'c2_pilot_forecast_create','{O[6]}');{ins(O[6])}ROLLBACK;")
    ok('pedido C2 sem aprovações: barreira só aceita o ticket da própria transação (núcleo do piloto)',r.returncode==0,r.stderr[-200:])
    d.sql("UPDATE platform_private.b2b_forecast_creation_gate_v1 SET enabled=false WHERE singleton;")
    r=m.act(X.UFIN,f"INSERT INTO platform_private.authz_tickets(txid,scope,target) VALUES(txid_current(),'c2_pilot_forecast_create','{O[5]}');")
    ok('cliente autenticado não forja ticket',r.returncode!=0 and 'permission denied' in r.stderr,r.stderr[-200:])
    r=m.act(X.UFIN,f"SELECT platform_private.c2_pilot_econ_evidence_v1('{O[5]}');");ok('cliente não chama o leitor privado de evidência',r.returncode!=0 and 'permission denied' in r.stderr)
    r=m.act(X.UFIN,"SELECT * FROM platform_private.c2_pilot_econ_approvals_v1;");ok('cliente não lê o ledger',r.returncode!=0 and 'permission denied' in r.stderr)
    r=d.raw(f"UPDATE platform_private.c2_pilot_econ_approvals_v1 SET notes='x' WHERE order_id='{O[0]}';");ok('ledger imutável (UPDATE)',r.returncode!=0 and 'C2_PILOT_ECON_APPROVAL_IMMUTABLE' in r.stderr)
    r=d.raw("DELETE FROM platform_private.c2_pilot_econ_approvals_v1;");ok('ledger imutável (DELETE)',r.returncode!=0 and 'C2_PILOT_ECON_APPROVAL_IMMUTABLE' in r.stderr)
    # Revogação / desligamento
    d.sql(f"UPDATE platform_private.c2_pilot_econ_allowlist_v1 SET revoked_at=now(),revoke_reason='teste' WHERE order_id='{O[5]}' AND kind='commercial';")
    deny('concessão revogada',lambda: ap(X.UGC,O[5],'commercial',key(),evh(O[5])),'42501','C2_PILOT_ECON_NOT_GRANTED')
    r=run_file('06-pilot-disable.sql.review');ok('desligamento do piloto',r.returncode==0 and 'C2PILOT_DISABLE_PASS' in r.stdout,r.stderr[-300:])
    deny('após desligar: crédito recusado',lambda: ap(X.UFIN,O[5],'credit',key(),evh(O[5])),'42501','C2_PILOT_ECON_DISABLED')
    a3,e=ap(X.UGC,O[0],'commercial',k1,H0);ok('após desligar: replay de registro existente ainda reautoriza e devolve recibo',a3 and a3['replayed'],a3 or e)
    # Ausência de efeitos downstream
    ok('pedidos inalterados ao final',[row(o) for o in O]==R)
    EFF1={t:cnt(f"SELECT count(*) FROM {t}") for t in ('public.accounts_receivable','public.fiscal_invoices','public.estoque_movimentacoes','public.entregas','public.notificacoes_operacionais')+tuple(t for t in ('public.comunicacao_outbox','public.communication_outbox','public.fiscal_events','public.accounts_receivable_installments') if T(t))}
    ok('sem novo recebível, NF, estoque, entrega, notificação ou envio',EFF1==EFF0,(EFF0,EFF1))
    ok('previsões novas = 5 pedidos que chegaram a 11 (um evento cada)',cnt('SELECT count(*) FROM platform_private.b2b_financial_forecasts')-F0==5 and cnt('SELECT count(*) FROM platform_private.b2b_financial_forecast_events')-E0==5)
    # Leitores existentes
    v,e=m.call(X.UFIN,f"public.get_b2b_financial_forecast_secure('{O[0]}')");ok('leitor existente de previsão lê a previsão do piloto (estimada, total 20)',v and v['total_amount']==20 and v['due_dates_estimated'] is True,v or e)
    v,e=m.call(X.UADMF,f"public.get_b2b_financial_forecast_secure('{O[0]}')");ok('leitor existente nega outro tenant',v is None and 'B2B_FORECAST_READ_DENIED' in (e or ''),v or e)
    # Rollback
    snap=d.last("SELECT (SELECT count(*) FROM platform_private.c2_pilot_econ_approvals_v1)||'|'||(SELECT count(*) FROM platform_private.b2b_financial_forecasts)||'|'||(SELECT count(*) FROM platform_private.b2b_financial_forecast_events)")
    r=run_file('04-rollback-deny.sql.review',"SET c2pilot.expected_ref='wrong';");ok('ROLLBACK sem ref recusado',r.returncode!=0 and 'REF_UNPROVEN' in r.stderr)
    r=run_file('04-rollback-deny.sql.review');ok('ROLLBACK_PASS (deny-only)',r.returncode==0 and 'C2PILOT_ROLLBACK_PASS' in r.stdout,r.stderr[-500:])
    r=run_file('04-rollback-deny.sql.review');ok('ROLLBACK idempotente',r.returncode==0 and 'C2PILOT_ROLLBACK_PASS' in r.stdout,r.stderr[-300:])
    ok('rollback preserva ledger, previsões e eventos',d.last("SELECT (SELECT count(*) FROM platform_private.c2_pilot_econ_approvals_v1)||'|'||(SELECT count(*) FROM platform_private.b2b_financial_forecasts)||'|'||(SELECT count(*) FROM platform_private.b2b_financial_forecast_events)")==snap)
    r=m.act(X.UGC,f"SELECT public.c2_pilot_economic_approve_v1('{O[6]}','commercial','{key()}','{H0}',NULL);");ok('após rollback: RPC sem EXECUTE',r.returncode!=0 and 'permission denied' in r.stderr,r.stderr[-200:])
    r=m.act(X.UGC,f"SELECT public.c2_pilot_economic_state_v1('{O[6]}');");ok('após rollback: leitor sem EXECUTE',r.returncode!=0 and 'permission denied' in r.stderr)
    r=d.raw(ins(O[6]));ok('após rollback: barreira mantida contra inserção direta',r.returncode!=0 and 'C2_PILOT_FORECAST_ENTRY_DENIED' in r.stderr)
    r=run_file('03-post.sql.readonly');ok('POST após rollback falha (ACL fechada detectada)',r.returncode!=0 and 'C2PILOT_POST_ACL_DRIFT' in r.stderr,r.stderr[-200:])
    r=run_file('05-pilot-enable.sql.review',REF+f"SET c2pilot.order_id='{O[6]}';SET c2pilot.commercial_actor='{X.UGC}';SET c2pilot.credit_actor='{X.UFIN}';SET c2pilot.hours='2';SET c2pilot.reason='REABRIR APOS ROLLBACK';")
    ok('após rollback: habilitação recusada (ACL fechada)',r.returncode!=0 and 'C2PILOT_ENABLE_ACL_DRIFT' in r.stderr,r.stderr[-200:])
    for s,h in G.DEPS.items(): ok('após rollback: corpo LIVE intocado '+s,d.md5(s)==h)
    deny('após rollback: LIVE approve_partner_order segue bloqueado',lambda: m.call(X.UGC,f"public.approve_partner_order('{O[6]}',NULL)"),'42501','C2_ACCOUNTING_PENDING')
finally:
    ok('bytes executados = SHA256SUMS',all(SUMS[e['file']]==e['sha256'] for e in executed))
    (att/'checks.json').write_text(json.dumps(checks,indent=2,default=str)+'\n')
    (att/'executed.json').write_text(json.dumps(dict(executed=executed,sha256sums=SUMS,deps=G.DEPS,candidate=G.CAND),indent=2)+'\n')
    p=sum(c['status']=='PASS' for c in checks);f=sum(c['status']=='FAIL' for c in checks)
    (att/'summary.txt').write_text(f'PASS={p} FAIL={f}\n');print(f'SUMMARY PASS={p} FAIL={f} -> {att}')
    sys.exit(1 if f else 0)
