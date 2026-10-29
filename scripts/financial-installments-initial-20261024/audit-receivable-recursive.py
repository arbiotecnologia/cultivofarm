"""Offline catalog closure. Never contacts a database; lexical edges are not proof."""
import csv, hashlib, json, re
from pathlib import Path

H = Path(__file__).resolve().parent
OUT = H.parents[1] / 'docs/auditorias/evidencias-cadeia-financeira-20261029'
CAP = H / 'receivable-recursive-live-20261029.json'

def main():
    data = json.loads(CAP.read_text())
    assert data['ref'] == 'swzpzcwiasxmjutrmvkm'
    functions = {int(f['oid']): f for f in data['functions']}
    relations = {int(r['oid']): r for r in data['relations']}
    names = {}
    for oid, f in functions.items():
        for name in [f['name'], f['schema'] + '.' + f['name']]:
            names.setdefault(name, set()).add(oid)
    roots = {oid for oid, f in functions.items() if f['name'] in {
        'generate_b2b_receivable_secure', 'generate_b2b_receivable_secure_impl',
        'fn_generate_receivable_installments', 'rpc_register_receivable_payment',
        'fn_reverse_payment', 'tg_auto_b2b_receivable'} or
        re.search(r'accounts_receivable|receivable_payments', f['body'], re.I)}
    edges, seen_edges = [], set()
    def edge(source, target, kind, evidence):
        key = (source, target, kind, evidence)
        if key not in seen_edges:
            seen_edges.add(key)
            edges.append(dict(source=source, target=target, kind=kind, evidence=evidence))
    selected, tables = set(roots), set()
    changed = True
    while changed:
        old = (len(selected), len(tables))
        for oid in list(selected):
            f = functions[oid]
            assert hashlib.md5(f['body'].encode()).hexdigest() == f['md5']
            # Includes comments/strings conservatively; never described as resolved calls.
            for match in re.finditer(r'\b((?:[a-z_][\w]*\.)?[a-z_][\w]*)\s*\(', f['body'], re.I):
                for target in names.get(match[1], set()):
                    edge(oid, target, 'LEXICAL_CALL_OVERLOAD_CANDIDATE', match[1])
                    selected.add(target)
            for rid, r in relations.items():
                if re.search(r'\b' + re.escape(r['name']) + r'\b', f['body']):
                    edge(oid, rid, 'LEXICAL_RELATION', r['schema'] + '.' + r['name'])
                    tables.add(rid)
        for d in data['dependencies']:
            if int(d['classid']) == 1255 and int(d['objid']) in selected:
                target = int(d['refobjid'])
                edge(int(d['objid']), target, 'PG_DEPEND_' + str(d['refclassid']), d['deptype'])
                if int(d['refclassid']) == 1255 and target in functions: selected.add(target)
                if int(d['refclassid']) == 1259 and target in relations: tables.add(target)
            # View dependency records are owned by pg_rewrite, not pg_proc.
            if int(d['classid']) == 2618 and int(d['refclassid']) == 1259 and int(d['refobjid']) in tables:
                for other in data['dependencies']:
                    if int(other['classid']) == 2618 and other['objid'] == d['objid']:
                        target=int(other['refobjid'])
                        edge(int(d['refobjid']),target,'PG_REWRITE_'+str(other['refclassid']),str(d['objid']))
                        if int(other['refclassid']) == 1255 and target in functions: selected.add(target)
                        if int(other['refclassid']) == 1259 and target in relations: tables.add(target)
        for rid in list(tables):
            r = relations[rid]
            for tr in r['triggers'] or []:
                target = int(tr['function_oid'])
                edge(rid, target, 'PG_TRIGGER', tr['name'])
                if target in functions: selected.add(target)
            for c in r['constraints'] or []:
                target = int(c['ref_relation'])
                if target:
                    edge(rid, target, 'PG_CONSTRAINT_FK', c['definition'])
                    if target in relations: tables.add(target)
            policy_text = json.dumps(r['policies'])
            for name, targets in names.items():
                if re.search(r'\b' + re.escape(name) + r'\s*\(', policy_text):
                    for target in targets:
                        edge(rid, target, 'POLICY_LEXICAL', name); selected.add(target)
        changed = old != (len(selected), len(tables))
    OUT.mkdir(parents=True, exist_ok=True)
    with (OUT / 'dependency-edges.csv').open('w') as stream:
        writer = csv.DictWriter(stream, fieldnames=['source','target','kind','evidence'], lineterminator='\n')
        writer.writeheader(); writer.writerows(edges)
    dynamic = [dict(oid=o, signature=functions[o]['signature'],
                    lines=[i for i,line in enumerate(functions[o]['body'].splitlines(),1)
                           if re.search(r'\bEXECUTE\b|\bformat\s*\(',line,re.I)])
               for o in sorted(selected) if re.search(r'\bEXECUTE\b|\bformat\s*\(',functions[o]['body'],re.I)]
    result = dict(ref=data['ref'], captured_at=data['captured_at'],
                  capture_sha256=hashlib.sha256(CAP.read_bytes()).hexdigest(),
                  roots=sorted(roots), functions=[functions[o] for o in sorted(selected)],
                  relations=[relations[o] for o in sorted(tables)], dynamic_candidates=dynamic,
                  counts=dict(roots=len(roots),functions=len(selected),relations=len(tables),edges=len(edges),dynamic_candidates=len(dynamic)),
                  recursive_fixed_point=True, semantic_closure=False, operational_go=False,
                  limits='Conservative lexical edges include strings/comments/overloads. SQL dynamic, external schemas/extensions/jobs/importers and runtime branches remain unresolved. pg_depend does not close PL/pgSQL calls.')
    (OUT / 'closure.json').write_text(json.dumps(result,indent=2)+'\n')
    old = json.loads((H/'receivable-writers-live-20261028.json').read_text())['functions']
    drift = [dict(signature=f['signature'],before=f['md5'],after=functions[int(f['oid'])]['md5'])
             for f in old if int(f['oid']) in functions and f['md5'] != functions[int(f['oid'])]['md5']]
    (OUT/'drift.json').write_text(json.dumps(dict(compared=sum(int(f['oid']) in functions for f in old),differences=drift),indent=2)+'\n')
    print(json.dumps(result['counts'])); print('drift',len(drift))

if __name__ == '__main__': main()