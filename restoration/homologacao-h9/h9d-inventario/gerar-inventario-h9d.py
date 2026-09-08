import json, re, csv, hashlib, os, collections

def norm(sig):
    name = sig.split('(')[0].strip().split('.')[-1]
    args = sig[sig.find('(') + 1:sig.rfind(')')]
    types = []
    for a in [x.strip() for x in args.split(',') if x.strip()]:
        types.append(a.split()[-1].lower())
    return name + '(' + ','.join(types) + ')'

funcs = json.load(open('/tmp/h9d/funcs2.json'))
prev = {}
with open('restoration/homologacao-h9/h9c-inventario/secdef-authenticated-classificacao.tsv') as f:
    for row in csv.DictReader(f, delimiter='\t', lineterminator='\n'):
        prev[norm(row['signature'])] = (row['dominio'], row['classificacao_h9c'])

GUARDH = re.compile(r'(_?require_\w+|assert_\w+|_assert_\w+|can_user_access\w*|can_manage_\w+|pode_\w+|is_[a-z_]*staff|is_admin\w*|is_executivo|has_role|has_any_role|fn_onfarm_scope\w*|fn_b2b_can_\w+|fn_regulatory_can_\w+|fn_fiscal_can_\w+|_comunicacao_require\w*|_visita_lock_and_check|_cpp_\w+|check_\w*_permission)\s*\(', re.I)
GUARD = re.compile(r'auth\.uid\(\)|current_setting\s*\(\s*\'request\.jwt|auth\.role\(\)', re.I)
SENS = re.compile(r'accounts_(payable|receivable)|financial_|fiscal_|company_fiscal_settings|clientes?|cliente_|profiles|user_roles|partner_|produtos?|lotes?|estoque|ordens_servico|entregas?|entrega_|portal_|comunicacao_|communication_|evidencias|fazendas|talhoes|visita|aplicacoes|storage\.objects|auth\.users|commercial_|microrganismos?|microorganism_|bank_accounts|payment_|certificate|registros_consultor|pedido|solicitac|notificac|carrinho|simulac|catalogo_|recurring_', re.I)
ACC = re.compile(r'\b(from|join|update|insert\s+into|delete\s+from)\s+(only\s+)?([a-z_][\w\.]*)', re.I)
DML = re.compile(r'\b(insert\s+into|update\s+\w|delete\s+from|truncate)\b', re.I)
DYN = re.compile(r'\bexecute\s+(format|\'|"|\w+_sql|query|v_sql)', re.I)

# Excecoes documentadas com evidencia manual (corpo lido nesta fase).
MANUAL = {
    'fn_run_recurring_generation()': ('EXPOSICAO_COMPROVADA_CORRIGIDA', 'H9-D1: guarda is_financial_staff adicionada antes do laco; teste negativo 42501 e positivo cron/financeiro'),
    'rpc_validar_comprovante_entrega(uuid)': ('AUTH_COMPROVADA', 'H9-B: rate-limit antes da leitura; payload sem PII'),
    'rpc_validar_rastreio_produto(uuid)': ('AUTH_COMPROVADA', 'H9-B1: rate-limit por token/origem/global antes de leitura e escrita'),
    'fn_cockpit_is_hml_environment()': ('NAO_APLICAVEL', 'retorna apenas booleano de ambiente a partir de marcador interno'),
    'fn_fiscal_company_crt()': ('PENDENTE_EVIDENCIA', 'expoe CRT do emitente unico a qualquer authenticated; baixo impacto, sem PII; revisao de menor privilegio na H9-E'),
    'fn_catalogo_preco_canonico(uuid,uuid,text,numeric)': ('PENDENTE_EVIDENCIA', 'preco canonico de catalogo legivel por qualquer authenticated; consumido pelo portal B2B; avaliar escopo por parceiro na H9-E'),
    'get_cliente_ids_for_user(uuid)': ('PENDENTE_EVIDENCIA', 'aceita uid arbitrario e devolve UUIDs de clientes vinculados; usada dentro de policies RLS, revogacao exigiria refatoracao das policies'),
    'get_cliente_id_for_user(uuid)': ('PENDENTE_EVIDENCIA', 'idem: uid arbitrario devolve UUID de cliente principal; usada em policies RLS'),
    'has_role(uuid,app_role)': ('NAO_APLICAVEL', 'predicado de papel usado por todas as policies RLS; revogar quebraria RLS; expoe apenas booleano'),
    'is_executivo(uuid)': ('NAO_APLICAVEL', 'predicado booleano de papel usado em policies RLS'),
    'fn_regulatory_storage_can_delete(text)': ('AUTH_COMPROVADA', 'delega a fn_regulatory_storage_can_write, que valida papel regulatorio; retorna apenas booleano'),
    'get_user_partner_id()': ('AUTH_COMPROVADA', 'ancorada em auth.uid(); nao aceita id arbitrario'),
    'rpc_delete_diagnostico_visita(uuid)': ('AUTH_COMPROVADA', '_assert_visita_editavel executado antes do DELETE; leitura interna nao retornada ao chamador'),
    'rpc_delete_recomendacao_visita(uuid)': ('AUTH_COMPROVADA', '_assert_visita_editavel executado antes do DELETE; leitura interna nao retornada ao chamador'),
    'fn_microorganism_regulatory_facts(uuid)': ('PENDENTE_EVIDENCIA', 'metadados regulatorios internos (MAPA/NCM/CEST) legiveis por qualquer authenticated; sem PII e sem dado financeiro; menor privilegio a avaliar na H9-E'),
    'can_user_access_fazenda(uuid)': ('AUTH_COMPROVADA', 'delega a can_user_access_cliente, que ancora em auth.uid()'),
    'fn_onfarm_scope_lote(uuid)': ('AUTH_COMPROVADA', 'delega a fn_onfarm_scope_cliente, que ancora em auth.uid()'),
    'pode_acessar_recomendacao(uuid,uuid)': ('AUTH_COMPROVADA', 'checa papel e vinculo user_clientes no proprio predicado'),
}

rows = []
for f in funcs:
    sig = f['signature']
    dom, prevc = prev.get(norm(sig), ('F_OPERACAO_RELATORIO', 'NAO_INVENTARIADO'))
    i = f['def'].lower().find('as $')
    b = f['def'][i:] if i > 0 else f['def']
    gs = [m.start() for m in list(GUARDH.finditer(b)) + list(GUARD.finditer(b))]
    g = min(gs) if gs else None
    fs = None
    objs = set()
    for m in ACC.finditer(b):
        o = m.group(3).strip().rstrip(';,)')
        objs.add(o)
        if SENS.search(o) and fs is None:
            fs = m.start()
    if sig in MANUAL:
        cls, ev = MANUAL[sig]
    elif fs is None:
        cls, ev = 'NAO_APLICAVEL', 'nenhum objeto sensivel acessado no corpo'
    elif g is not None and g < fs:
        cls, ev = 'AUTH_COMPROVADA', 'guarda de identidade/papel precede o primeiro acesso sensivel'
    else:
        cls, ev = 'PENDENTE_EVIDENCIA', 'acesso sensivel sem guarda anterior detectada; requer leitura manual'
    rows.append(dict(
        schema=f['schema'], signature=sig, owner=f['owner'], language=f['language'],
        volatility=f['volatility'], proconfig=f['proconfig'], anon_execute=f['anon_x'],
        acl=f['acl'], dominio=dom, classificacao_h9c=prevc,
        objetos_sensiveis=';'.join(sorted(o for o in objs if SENS.search(o))),
        dml=int(bool(DML.search(b))), sql_dinamico=int(bool(DYN.search(b))),
        guarda_pos='' if g is None else g, primeiro_acesso_sensivel_pos='' if fs is None else fs,
        body_len=len(b), body_md5=hashlib.md5(b.encode()).hexdigest(),
        classificacao_h9d=cls, evidencia=ev))

rows.sort(key=lambda r: r['signature'])
d = 'restoration/homologacao-h9/h9d-inventario'
os.makedirs(d, exist_ok=True)
with open(d + '/secdef-authenticated-inventory-h9d.tsv', 'w', newline='') as fh:
    w = csv.DictWriter(fh, fieldnames=list(rows[0].keys()), delimiter='\t', lineterminator='\n')
    w.writeheader()
    [w.writerow(r) for r in rows]
with open(d + '/classificacao-h9d.tsv', 'w', newline='') as fh:
    w = csv.writer(fh, delimiter='\t', lineterminator='\n')
    w.writerow(['dominio', 'signature', 'dml', 'classificacao_h9d', 'evidencia'])
    for r in rows:
        w.writerow([r['dominio'], r['signature'], r['dml'], r['classificacao_h9d'], r['evidencia']])

c = collections.Counter(r['classificacao_h9d'] for r in rows)
dom = collections.Counter(r['dominio'] for r in rows)
with open(d + '/resumo-h9d.json', 'w') as fh:
    json.dump({'total_auditado': len(rows), 'por_classificacao': dict(c), 'por_dominio': dict(dom),
               'ledger': 662, 'ambiente': 'staging ikaauvsflpmamgxmkhoq'}, fh, indent=2, ensure_ascii=False)
print(len(rows), dict(c))
print(dict(dom))
for r in rows:
    if r['classificacao_h9d'] == 'PENDENTE_EVIDENCIA':
        print('PEND:', r['signature'])
