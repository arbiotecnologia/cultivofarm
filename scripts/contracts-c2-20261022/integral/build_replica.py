"""Builds a disposable-PostgreSQL replica of the hosted relations/functions/triggers/
policies/ACL involved in C2+finance, from read-only structural captures (no rows,
no credentials). Only Supabase-internal Auth functions (auth.uid/jwt/role/email) and
FK target tables outside the captured closure are SYNTHETIC stubs, listed in
replica-synthetic.txt."""
import json, re
from pathlib import Path
H = Path(__file__).resolve().parent
cap = json.loads((H / 'hosted-capture.json').read_text())
auth = json.loads((H / 'hosted-capture-auth.json').read_text())
rels = auth['rels'] + cap['rels']
extra = json.loads((H / 'hosted-capture-extra.json').read_text())
fns = {f['sig']: f for f in cap['fns'] + (auth['fns'] or []) + extra}
names = {r['r'] for r in rels}
synthetic = []
out = []
w = out.append
w("SET check_function_bodies=off; SET client_min_messages=warning;")
for role in ['anon', 'authenticated', 'service_role', 'supabase_auth_admin', 'dashboard_user', 'authenticator', 'supabase_admin']:
    w(f"DO $$BEGIN CREATE ROLE {role} NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END$$;")
w("ALTER ROLE service_role BYPASSRLS;")
w("GRANT anon, authenticated, service_role TO authenticator;")
for s in sorted({'auth', 'platform_private', 'cf_user_guards_v1'} | {k.split('(')[0].rsplit('.',1)[0] for k in fns if '.' in k.split('(')[0]}):
    w(f"CREATE SCHEMA IF NOT EXISTS {s};")
for line in (H / 'hosted-schema-acl.txt').read_text().split():
    nsp, owner, acl = line.split('|')
    if owner != 'pg_database_owner': w(f"ALTER SCHEMA {nsp} OWNER TO {owner};")
    w(f"REVOKE ALL ON SCHEMA {nsp} FROM PUBLIC;")
    for grantee, privs, grantor in re.findall(r'([a-z_]*)=([UC]+)/([a-z_]+)', acl):
        if grantee in (owner, 'pg_database_owner'): continue
        w(f"GRANT {', '.join({'U':'USAGE','C':'CREATE'}[c] for c in privs)} ON SCHEMA {nsp} TO {grantee or 'PUBLIC'};")
# SYNTHETIC Auth functions: same names/signatures as Supabase, claims from GUC.
w("""CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$SELECT coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(auth.jwt()->>'sub','')::uuid$$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$SELECT auth.jwt()->>'role'$$;
CREATE FUNCTION auth.email() RETURNS text LANGUAGE sql STABLE AS $$SELECT auth.jwt()->>'email'$$;
GRANT EXECUTE ON FUNCTION auth.jwt(),auth.uid(),auth.role(),auth.email() TO anon,authenticated,service_role;""")
synthetic.append('auth.jwt/uid/role/email: request.jwt.claims GUC (Supabase-internal bodies not captured; hosted md5 listed in hosted-capture-auth.json)')
for e in cap['enums']:
    vals = ','.join("'" + v.replace("'", "''") + "'" for v in e['v'])
    t = e['t'] if '.' in e['t'] else 'public.' + e['t']
    w(f"CREATE TYPE {t} AS ENUM ({vals});")
seqs = set()
for r in rels:
    for c in r['cols']:
        for s in re.findall(r"nextval\('([^']+)'", c[3] or ''):
            seqs.add(s if '.' in s else 'public.' + s)
for s in sorted(seqs):
    w(f"CREATE SEQUENCE {s};")
def q(rel):
    return rel if '.' in rel else 'public.' + rel
# Context relations outside the closure (FK targets / policy subqueries): exact hosted
# columns + PK only; their own policies/triggers/ACL are NOT replicated (deny to clients).
ctx = json.loads((H / 'hosted-capture-context.json').read_text())
for c in ctx:
    cols = ', '.join(f'"{n}" {t}' + (' NOT NULL' if nn else '') for n, t, nn in c['cols'])
    w(f"CREATE TABLE {q(c['r'])} ({cols}{', ' + c['pk'] if c['pk'] else ''});")
    if c['rls']: w(f"ALTER TABLE {q(c['r'])} ENABLE ROW LEVEL SECURITY;")
    synthetic.append(f"context relation {q(c['r'])}: hosted columns/PK only; policies/triggers/ACL not replicated (clients denied)")
stubs = {}
later = []
for r in rels:
    cols = []
    for name, typ, nn, dflt, gen, ident in r['cols']:
        d = f'"{name}" {typ}'
        if gen == 's':
            d += f' GENERATED ALWAYS AS ({dflt}) STORED'
        elif ident in ('a', 'd'):
            d += ' GENERATED ' + ('ALWAYS' if ident == 'a' else 'BY DEFAULT') + ' AS IDENTITY'
        elif dflt is not None:
            later.append(f'ALTER TABLE {r["r"]} ALTER COLUMN "{name}" SET DEFAULT {dflt};')
        if nn:
            d += ' NOT NULL'
        cols.append(d)
    w(f"CREATE TABLE {r['r']} ({', '.join(cols)});")
for f in sorted(fns):
    w(fns[f]['def'].rstrip() + ';')
out.extend(later)
for kinds in ('pucx', 'f'):
    for r in rels:
        for c in r['cons'] or []:
            if c[1] in kinds and c[1] != 'n':
                w(f'ALTER TABLE {r["r"]} ADD CONSTRAINT "{c[0]}" {c[2]};')
for r in rels:
    for i in r['idx'] or []:
        w(i + ';')
    for t in r['trg'] or []:
        w(t + ';')
    if r['rls']:
        w(f"ALTER TABLE {r['r']} ENABLE ROW LEVEL SECURITY;")
    if r['force']:
        w(f"ALTER TABLE {r['r']} FORCE ROW LEVEL SECURITY;")
    cmd = {'r': 'SELECT', 'a': 'INSERT', 'w': 'UPDATE', 'd': 'DELETE', '*': 'ALL'}
    for name, c, perm, roles, qual, chk in r['pol'] or []:
        s = f'CREATE POLICY "{name}" ON {r["r"]} AS {"PERMISSIVE" if perm else "RESTRICTIVE"} FOR {cmd[c]} TO {", ".join(roles)}'
        if qual: s += f' USING ({qual})'
        if chk: s += f' WITH CHECK ({chk})'
        w(s + ';')
TP = {'r': 'SELECT', 'a': 'INSERT', 'w': 'UPDATE', 'd': 'DELETE', 'D': 'TRUNCATE', 'x': 'REFERENCES', 't': 'TRIGGER', 'm': 'MAINTAIN'}
def acl_items(acl):
    return re.findall(r'"?([a-z_]*)=([a-zA-Z*]*)/"?([a-z_]+)"?', acl or '')
for r in rels:
    w(f"ALTER TABLE {r['r']} OWNER TO {r['owner']};")
    if r['acl'] is not None:
        w(f"REVOKE ALL ON {r['r']} FROM PUBLIC, {r['owner']};")
        for grantee, privs, grantor in acl_items(r['acl']):
            g = grantee or 'PUBLIC'
            plain = [TP[p] for i, p in enumerate(privs) if p != '*' and not (i + 1 < len(privs) and privs[i + 1] == '*')]
            opt = [TP[p] for i, p in enumerate(privs) if p != '*' and i + 1 < len(privs) and privs[i + 1] == '*']
            pre = f"SET ROLE {grantor}; " if grantor != r['owner'] else ''
            post = " RESET ROLE;" if pre else ''
            if plain: w(f"{pre}GRANT {', '.join(plain)} ON {r['r']} TO {g};{post}")
            if opt: w(f"{pre}GRANT {', '.join(opt)} ON {r['r']} TO {g} WITH GRANT OPTION;{post}")
for sig, f in sorted(fns.items()):
    sigq = sig if '.' in sig.split('(')[0] else 'public.' + sig
    w(f"ALTER FUNCTION {sigq} OWNER TO {f['owner']};")
    if f['acl'] is not None:
        w(f"REVOKE ALL ON FUNCTION {sigq} FROM PUBLIC, {f['owner']};")
        for grantee, privs, grantor in acl_items(f['acl']):
            w(f"GRANT EXECUTE ON FUNCTION {sigq} TO {grantee or 'PUBLIC'};")
for s in sorted(seqs):
    w(f"GRANT USAGE ON SEQUENCE {s} TO authenticated, service_role;")
w("INSERT INTO cf_user_guards_v1.state(singleton,revision) VALUES (true,0);" if any(r['r'] == 'cf_user_guards_v1.state' for r in rels) else '')
synthetic.append('cf_user_guards_v1.state: one synthetic singleton row (true,0) (hosted row content not copied)')
open(H / 'replica.sql', 'w', newline='').write('\n'.join(out) + '\n')
(H / 'replica-synthetic.txt').write_text('\n'.join(synthetic) + '\n')
print(len(out), 'statements;', len(stubs), 'stubs;', len(fns), 'functions;', len(rels), 'relations')
