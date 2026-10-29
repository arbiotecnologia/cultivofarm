"""Captured disposable risk/governance slice; never seed around a failing guard."""
NAMES = ['partner_accounts', 'partner_financial_settings', 'partner_risk_scores',
         'financial_governance_audit_log', 'partner_audit_logs']

def compose(h):
    m, r = h.m, h.r
    m.pg.sql("ALTER TABLE profiles ADD COLUMN id uuid UNIQUE DEFAULT gen_random_uuid(); ALTER TABLE profiles ADD COLUMN updated_at timestamptz DEFAULT now(); ALTER TABLE organizations ADD COLUMN status text DEFAULT 'ativa'; ALTER TABLE organizations ADD COLUMN partner_account_id uuid; ALTER TABLE payment_methods ADD COLUMN name text; UPDATE payment_methods SET name='LOCAL_METHOD';")
    for name in NAMES+['clientes', 'partner_users', 'user_clientes', 'fazendas']:
        t=h.relation(name)
        for c in r.live['columns']:
            if c['relation_oid']==t['oid']:
                for e in r.live['enums']:
                    if c['type']==e['name'] and m.pg.sql('SELECT to_regtype('+m.q(c['type'])+') IS NULL')=='t':
                        values=[m.q(v['value']) for v in r.live['enums'] if v['name']==e['name']]
                        m.pg.sql('CREATE TYPE '+c['type']+' AS ENUM ('+','.join(values)+');')
        h.table(name)
    # Calculator read surface only. No fabricated order/origin fixture.
    m.pg.sql('ALTER TABLE partner_orders ADD COLUMN partner_id uuid REFERENCES partner_accounts(id); ALTER TABLE partner_orders ADD COLUMN created_at timestamptz DEFAULT now(); ALTER TABLE partner_orders ADD COLUMN status text;')
    ticket=next(t for t in r.live['relations'] if t['schema']=='platform_private' and t['name']=='authz_tickets')
    cols=[c['name']+' '+c['type']+(' DEFAULT '+c['default'] if c['default'] else '')+(' NOT NULL' if c['notnull'] else '') for c in r.live['columns'] if c['relation_oid']==ticket['oid']]
    m.pg.sql('CREATE TABLE platform_private.authz_tickets('+','.join(cols+['CONSTRAINT '+c['name']+' '+c['definition'] for c in ticket['constraints']])+'); ALTER TABLE platform_private.authz_tickets ENABLE ROW LEVEL SECURITY; REVOKE ALL ON platform_private.authz_tickets FROM PUBLIC,authenticated,anon,service_role;')
    functions=[('platform_private','c2_producer_links'),('public','is_valid_b2b_partner_user'),('platform_private','b2b_commercial_context'),('platform_private','b2b_coherent_self_partner'),('platform_private','b2b_direct_partner_row_allowed'),('platform_private','c2p1_internal_actor'),('platform_private','c2p1_settings_allowed'),('platform_private','has_ticket'),('platform_private','issue_ticket'),('platform_private','c2p1_settings_fence'),('public','guard_commercial_partner_registration'),('public','tg_create_default_pfs'),('public','partner_audit_trigger'),('public','recalc_partner_prices_on_default_change'),('public','tg_governance_audit'),('public','tg_pfs_updated_at'),('public','update_updated_at_column'),('public','recalc_partner_risk_score'),('platform_private','c2p1_update_settings'),('public','rpc_update_partner_financial_settings')]
    for schema,name in functions:
        f=r.captured(schema,name)
        h.pins.append({k:f[k] for k in ['oid','signature','md5','owner','acl']})
        h.acl('FUNCTION',f['signature'],f['acl'])
        h.check('risk captured body exact '+f['signature'],f['md5'],m.pg.sql('SELECT md5(pg_get_functiondef('+m.q(f['signature'])+'::regprocedure))'),'RISK_CAPTURED')
    supported=set(NAMES+['clientes','profiles','organizations']); omitted=[]
    for name in NAMES:
        t=h.relation(name)
        for c in t['constraints'] or []:
            if not c['definition'].startswith('FOREIGN KEY'): continue
            if any('REFERENCES '+n+'(' in c['definition'] for n in supported):
                m.pg.sql('ALTER TABLE '+name+' ADD CONSTRAINT '+c['name']+' '+c['definition']+';')
            else: omitted.append(name+'.'+c['name'])
        for tr in t['triggers'] or []: m.pg.sql(tr['definition']+';')
        h.policies(name)
    h.extra_state_tables=NAMES+['platform_private.authz_tickets']
    return dict(functions=[s+'.'+n for s,n in functions],tables=NAMES,omitted_fks=omitted,
        limits='Calculator slice only: order table retains minimal harness plus referenced columns; order INSERT/FKs/triggers/RLS not composed, zero order fixtures. Empty support identity/catalog schemas lack transitives; partner creation must clear every captured partner/settings trigger before positive B2B.')

def exercise(h, metadata):
    m=h.m; partner=m.uid(900002)
    for actor,org,label in [(m.U,m.A,'A'),(h.V,m.B,'B')]:
        m.pg.sql(f"INSERT INTO user_roles VALUES('{actor}','administrador');")
        try:
            before=h.state()
            result=h.client(f"INSERT INTO partner_accounts(id,razao_social,commercial_owner_organization_id) VALUES('{partner}','LOCAL PARTNER {label}','{org}');",actor)
            h.check('risk partner '+label+' exact creation barrier',('42501','C2P1_SETTINGS_WRITE_CLOSED'),h.error_tuple(result),'RISK_BLOCKED_EXPECTED')
            h.check('risk partner '+label+' barrier atomic',before,h.state(),'RISK_BLOCKED_EXPECTED')
            h.responses.append(dict(test='partner creation '+label,stderr=result.stderr))
        finally: m.pg.sql(f"DELETE FROM user_roles WHERE user_id='{actor}' AND role='administrador';")
    before=h.state(); result=h.client('SELECT recalc_partner_risk_score(NULL);',None,'anon')
    h.check('risk anon ACL denial','42501',h.error_tuple(result)[0],'RISK_CAPTURED')
    h.check('risk anon atomic',before,h.state(),'RISK_CAPTURED')
    m.pg.sql(f"DELETE FROM user_roles WHERE user_id='{m.U}';")
    try:
        result=h.client(f"SELECT recalc_partner_risk_score('{partner}');")
        h.check('risk revoked staff exact denial',('42501','permission_denied'),h.error_tuple(result),'RISK_CAPTURED')
        h.check('risk revoked direct atomic',before,h.state(),'RISK_CAPTURED')
    finally: m.pg.sql(f"INSERT INTO user_roles VALUES('{m.U}','financeiro');")
    for actor,label in [(m.U,'A'),(h.V,'B')]:
        before=h.state(); result=h.client(f"SELECT recalc_partner_risk_score('{partner}');",actor)
        h.check('risk '+label+' exact FK barrier','23503',h.error_tuple(result)[0],'RISK_BLOCKED_EXPECTED')
        h.check('risk '+label+' FK barrier atomic',before,h.state(),'RISK_BLOCKED_EXPECTED')
        h.responses.append(dict(test='full risk calculator '+label,stderr=result.stderr))
    h.check('risk no fabricated ticket or partner','0|0',m.pg.sql('SELECT (SELECT count(*) FROM platform_private.authz_tickets),(SELECT count(*) FROM partner_accounts)'),'RISK_CAPTURED')
    metadata['blocked']='Partner INSERT → tg_create_default_pfs → c2p1_settings_fence requires canonical settings ticket; captured INSERT path does not issue it. No captured partner INSERT provisioner found. Full risk call reaches 23503 partner FK; no positive B2B claimed.'