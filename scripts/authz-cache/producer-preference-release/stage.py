"""Only stage byte-exact review copies; never apply to project or deploy."""
from pathlib import Path
import hashlib,json,sys
ROOT=Path(__file__).resolve().parents[3]
HERE=Path(__file__).resolve().parent
def sha(data):return hashlib.sha256(data).hexdigest()
def stage(destination,mode='candidate'):
    m=json.loads((HERE/'manifest.json').read_bytes().decode('utf-8'))
    for i in m['files']:
        if sha((ROOT/i['path']).read_bytes())!=i['post_sha256']:raise ValueError('source_drift:'+i['path'])
        for k in ('candidate','rollback'):
            if i[k] and sha((HERE/i[k]).read_bytes())!=i['post_sha256' if k=='candidate' else 'pre_sha256']:raise ValueError('artifact_drift:'+i[k])
    a=m['activation']
    for k,h in [('candidate','post_sha256'),('rollback','pre_sha256')]:
        if sha((HERE/a[k]).read_bytes())!=a[h]:raise ValueError('activation_drift')
    for path,expected in m['protected_sha256'].items():
        if sha((ROOT/path).read_bytes())!=expected:raise ValueError('protected_drift:'+path)
    if mode=='activation':items=[a]
    elif mode in ('candidate','rollback'):items=m['files']
    else:raise ValueError('invalid mode')
    removals=[]
    for i in items:
        label='rollback' if mode=='rollback' else 'candidate'
        if i[label] is None:removals.append(i['path']);continue
        p=destination/i['path'];p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes((HERE/i[label]).read_bytes())
    if removals:(destination/'REMOVE-NEW-FILES.review.json').write_bytes((json.dumps(removals)+'\n').encode('utf-8'))
if __name__=='__main__':
    if len(sys.argv)!=3:raise SystemExit('usage: stage.py candidate|rollback|activation <outside-project-review-directory>')
    d=Path(sys.argv[2]).resolve()
    if d==ROOT or ROOT in d.parents:raise SystemExit('No application allowed; output outside project only')
    stage(d,sys.argv[1])
