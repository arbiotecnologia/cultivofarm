import json,collections,subprocess
from pathlib import Path
R=Path('/dev-server/scripts/responsive-layout-116');P=R/'MATRIX.json';m=json.load(open(P));backup=R/'final/MATRIX-before-final.json'
if not backup.exists():backup.write_bytes(P.read_bytes())
chains={x['id']:x for x in json.load(open(R/'final/CHAINS.json'))};rules=json.load(open(R/'closure/profile-rules.json'));fix={17:['administrador','gestor','operador_onfarm','cliente_produtor','administrativo','producao','aplicador','financeiro'],52:['administrador','gestor','consultor_tecnico','administrativo','tecnico_agronomo'],73:['administrador','gestor','consultor_tecnico','cliente_produtor','administrativo','tecnico_agronomo'],75:['administrador','gestor','operador_onfarm','cliente_produtor','administrativo','producao','aplicador','financeiro'],80:['administrador','gestor'],83:['administrador','gestor'],84:['administrador','gestor','consultor_tecnico','operador_onfarm','administrativo','tecnico_agronomo','producao'],85:['administrador','gestor','consultor_tecnico','operador_onfarm','administrativo','tecnico_agronomo','producao'],97:['administrador','gestor'],100:['administrador','gestor_comercial'],101:['administrador','gestor','financeiro'],93:['administrador'],96:['administrador','gestor','gestor_comercial','financeiro'],115:['parceiro_b2b'],116:['administrador','gestor_comercial'],19:['gestor'],48:[],49:[],4:['administrador','gestor'],5:['administrador','gestor']}
rows=[]
for pat,key in [('gap-*.json','status'),('previous-*.json','status'),('context-*.json','result')]:
 for p in (R/'final').glob(pat):
  for r in json.load(open(p)):
   rows.append((r,key,str(p.relative_to(R))))
guards=[r for p in (R/'final').glob('guards-*.json') for r in json.load(open(p))]
for x in m['items']:
 i=x['id'];new=[]
 for r,key,path in rows:
  if i not in r.get('ids',[r.get('id')]):continue
  new.append({'profile':r['profile'],'viewport':r['viewport'],'type':'ORIGINAL_CONTEXTUAL_DRIVER_LOCAL','result':r[key],'evidence':r.get('evidence',r.get('artifacts',[])),'record':path,'gap':r.get('error')})
 x['final_scenarios']=new;x['final_guard_records']=[{'profile':r['profile'],'viewport':r['viewport'],'result':r['result'],'controls':r['controls'],'evidence':r['evidence']} for r in guards if i in r['ids']]
 if i in chains:x['consumer_chain']=chains[i];x['consumer_chain_record']='final/CHAINS.json'
 if i in fix:x['action_profiles']=fix[i];x['action_rule_complete']=True
 chain=chains.get(i,{});gate=chain.get('gate','');unresolved=any(w in gate for w in ['unresolved','NOT_FULLY_TRACED','not fully resolved','not a fixed role','enumeration insufficient']) or i in [3,6,7,9,13,26,37,38,42,53,54,87,88,89,90]
 if i in chains and not unresolved:x['action_rule_complete']=True
 used=x.get('closure_scenarios',[])+new;passed={(r['profile'],r['viewport'][0]) for r in used if r['result'].startswith(('PASS','ASSERTED'))};wanted={(r,w) for r in x['action_profiles'] for w in [390,1440]};x['comparisons_missing']=[{'profile':r,'width':w} for r,w in sorted(wanted-passed)]
 if i in [48,49]:x['result']='N_A_ORIGINAL_CONSUMER_GATE_CLOSED';x['gap']=None
 elif x['result'].startswith('N_A'):pass
 elif i==116:
  x['result']='COMPLETE_LOCAL_STAFF_SELECTOR_GEOMETRY_ROUTE_GUARD_DENIES';x['gap']='Layout original e troca staff provados isoladamente; B2BRouteGuard original nega navegação staff. Guard preservado, sem declarar acesso integral.';x['corrections']=['Seletor staff visível em 390px; nomes extensos nas opções, troca dos dois parceiros ambos perfis e larguras.']
 elif unresolved:
  x['result']='ASSERTED_GEOMETRY_WITH_CONTEXT_OR_CHAIN_GAP';x['gap']='Geometria reutilizada; contexto/capacidade/consumidor não integralmente resolvido. Ver cadeia e guards.'
 elif x.get('action_rule_complete') and not x['comparisons_missing']:
  x['result']='COMPLETE_DECLARED_ACTION_PROFILE_GEOMETRY';x['gap']=None
 else:x['result']='ASSERTED_PARTIAL_ACTION_PROFILE_COVERAGE';x['gap']='Perfil/entrada pendente; comparações faltantes e cadeia explícitas.'
 if i==101:x['excluded_profile_evidence']='superadmin não tem acesso à rota tenant em FiscalProdutos.tsx:195-196; plataforma é outro contexto.'
 if i==97:x['excluded_profile_evidence']='gestor_comercial excluído por Clientes.tsx:17,49; mount direto anterior não prova entrada normal.'
 if i==88:x['gap']='Voltar provado no wizard isolado; guarda technical: administrador positivo, demais perfis precisam contexto técnico fresco real, ausente na fixture. Nenhuma concessão criada.'
counts=dict(collections.Counter(x['result'] for x in m['items']));m['summary']={'ids':116,'by_id':counts,'chains_traced':61,'new_browser_scenarios':len(rows),'new_browser_positive':sum(r[k].startswith(('PASS','ASSERTED')) for r,k,p in rows),'guard_comparisons':len(guards),'scope':'local synthetic geometry; source chain qualification; guards kept original; no production JWT/RLS/Storage certification'};m['revision_observed']=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip();m['closure']='final/REPORT.md';P.write_text(json.dumps(m,ensure_ascii=False,separators=(',',':')));(R/'final/SUMMARY.json').write_text(json.dumps(m['summary'],ensure_ascii=False,indent=2));assert len(m['items'])==116 and sum(counts.values())==116;print(json.dumps(m['summary'],indent=2))
