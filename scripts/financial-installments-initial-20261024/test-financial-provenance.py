"""Offline lexical false-positive regression; never certifies consumer semantics."""
import argparse, hashlib, json, re, tempfile
from pathlib import Path
H=Path(__file__).resolve().parent; ROOT=H.parents[1]
E=ROOT/'docs/auditorias/evidencias-cadeia-financeira-20261029'

def classify(line):
    # Strip SQL strings before distinguishing EXECUTE keyword from access-level data.
    outside=re.sub(r"'(?:''|[^'])*'", "''",line)
    if re.search(r'\bEXECUTE\s+(?:format\s*\(|[a-z_]\w*)',outside,re.I): return 'EXECUTABLE_DYNAMIC_SQL'
    if re.search(r'\bformat\s*\(',outside,re.I): return 'TEXT_FORMAT_NOT_SQL_EXECUTE'
    return 'LEXICAL_ACCESS_LEVEL_NOT_SQL_EXECUTE'

def main():
    p=argparse.ArgumentParser();p.add_argument('--output-dir',type=Path);a=p.parse_args()
    out=a.output_dir or Path(tempfile.mkdtemp(prefix='financial-provenance-',dir='/tmp'))
    if a.output_dir:out.mkdir(parents=True,exist_ok=False)
    live=json.loads((H/'receivable-recursive-live-20261029.json').read_text());assert live['ref']=='swzpzcwiasxmjutrmvkm'
    closure=json.loads((E/'closure.json').read_text());rows=[]; checks=[]
    def check(name, expected, actual):
        checks.append(dict(test=name,expected=expected,actual=actual,status='PASS' if expected==actual else 'FAIL'))
        assert expected==actual,checks[-1]
    for d in closure['dynamic_candidates']:
        fs=[f for f in live['functions'] if int(f['oid'])==d['oid']];assert len(fs)==1
        f=fs[0];assert f['signature']==d['signature'];assert hashlib.md5(f['body'].encode()).hexdigest()==f['md5']
        for number in d['lines']:
            line=f['body'].splitlines()[number-1]
            rows.append(dict(signature=f['signature'],line=number,text=line,classification=classify(line),md5=f['md5']))
            expected_site='EXECUTABLE_DYNAMIC_SQL' if d['oid']==41591 else 'TEXT_FORMAT_NOT_SQL_EXECUTE' if d['oid'] in [41900,42117,42604] else 'LEXICAL_ACCESS_LEVEL_NOT_SQL_EXECUTE'
            check(f['signature']+':'+str(number),expected_site,classify(line))
    expected={'EXECUTABLE_DYNAMIC_SQL':1,'TEXT_FORMAT_NOT_SQL_EXECUTE':4,'LEXICAL_ACCESS_LEVEL_NOT_SQL_EXECUTE':9}
    counts={k:sum(r['classification']==k for r in rows) for k in expected};assert counts==expected,(counts,rows)
    impl=[r for r in rows if r['signature']=='generate_b2b_receivable_secure_impl(uuid)']
    check('impl formats are not executable SQL',True,[r['line'] for r in impl]==[137,146] and all(r['classification']=='TEXT_FORMAT_NOT_SQL_EXECUTE' for r in impl))
    # Mutation controls: classifier must notice actual execution, not keyword data.
    check('mutation EXECUTE','EXECUTABLE_DYNAMIC_SQL',classify("EXECUTE format('SELECT * FROM %I',table_name);"))
    check('mutation access literal','LEXICAL_ACCESS_LEVEL_NOT_SQL_EXECUTE',classify("access_level IN ('read','execute','manage')"))
    check('mutation text format','TEXT_FORMAT_NOT_SQL_EXECUTE',classify("format('Pedido %s',order_number)"))
    dynamic=next(f for f in live['functions'] if int(f['oid'])==41591)
    branch="IF p_origem_os IN ('manual','b2b') THEN v_tabela_os := 'ordens_servico';\n    ELSE v_tabela_os := 'ordens_servico_onfarm';"
    check('dynamic identifier finite branch',1,dynamic['body'].count(branch))
    targets=['ordens_servico','ordens_servico_onfarm']
    for name in targets:
        t=next(t for t in live['relations'] if t['schema']=='public' and t['name']==name)
        check('dynamic target captured '+name,True,all(any(c['relation_oid']==t['oid'] and c['name']==column for c in live['columns']) for column in ['id','status']))
    current=json.loads((E/'consumers-current.json').read_text());prior=json.loads((E/'consumers-prior-inventory.json').read_text())
    check('17 consumer identities',True,len(current)==len(prior)==17)
    consumers=[]
    for c in current:
        previous=next(x for x in prior if x['path']==c['path']);actual=hashlib.md5((ROOT/c['path']).read_bytes()).hexdigest()
        check('fingerprint '+c['path'],True,actual==c['current_md5']==c['md5']==previous['md5'])
        assert c['proof']=='SOURCE_ONLY_NOT_END_TO_END' and c['scope']=='SOURCE_ONLY_DYNAMIC_DISPATCH_UNCLOSED'
        consumers.append(dict(path=c['path'],md5=actual,proof=c['proof'],scope=c['scope']))
    result=dict(candidate_sites=rows,classifications=counts,consumers=consumers,checks=checks,counts={s:sum(c['status']==s for c in checks) for s in ['PASS','FAIL']},dynamic_targets=targets,
        assertion_basis='Concrete independently failing assertions are recorded individually; dynamic targets resolved from pinned assignment branch, not executed operationally',
        blocked=['Only executable dynamic candidate requires full laboratory authorization chain; no operational execution authorized by this classification','External importer/job/runtime dispatch and metric-specific BI/accounting provenance remain unproved'],operational_go=False)
    (out/'provenance.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result['counts']))

if __name__=='__main__':main()