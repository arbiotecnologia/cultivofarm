"""Offline, fixed-baseline assembler. Never connects to hosted services."""
from pathlib import Path
import importlib.util,json,hashlib,re,subprocess
H=Path(__file__).resolve().parent
ROOT=H.parents[1]
BASELINE='c30af10c472255c919d167bc555c4f757eedaff0'
APPROVAL='e6a67a2d4c0146760c17e6c5bf6003027dedf87f'
UI='src/components/ordens-servico/OSDetalhesDialog.tsx'
UI_PRE='d181e5b904cb8b4b5ad8a42a0f398173909d73da9b63e54cb06479c0a7b8a73f'
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def verify_protected():
 for path,expected in json.loads((H/'protected.json').read_text()).items():
  if sha(ROOT/path)!=expected: raise ValueError('protected_drift:'+path)
 for commit in [BASELINE,APPROVAL]:
  data=subprocess.check_output(['git','show',commit+':'+UI],cwd=ROOT)
  if hashlib.sha256(data).hexdigest()!=UI_PRE or (H/'rollback/OSDetalhesDialog.tsx').read_bytes()!=data: raise ValueError('fixed_baseline_drift')
def guard(post=False):
 # Reuse immutable observed catalog predicates, not a moving HEAD or altered approval package.
 spec=importlib.util.spec_from_file_location('approval_catalog',ROOT/'scripts/os-approval-recovery/assemble.py')
 m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
 posts=json.loads((ROOT/'scripts/os-approval-recovery/post-hashes.json').read_text())
 rewritten=[]
 new_hash=json.loads((H/'post-hashes.json').read_text())['public.rpc_programar_os_v1(uuid,text,date)']
 for sig,digest,vol,sec,config,roles in m.CONTRACTS:
  if sig in posts: digest=posts[sig]
  if sig=='public.rpc_aprovar_os_v1(uuid,text)': roles=['authenticated','postgres']
  if sig=='public.rpc_programar_os_v1(uuid,text,date)' and post:
   digest=new_hash;config='search_path=""'
  rewritten.append((sig,digest,vol,sec,config,roles))
 m.CONTRACTS=rewritten
 result=m.guard(False).replace('OS_APPROVAL_','OS_PROGRAMMING_')
 # The reader already installed by the auditor stays unchanged; operations stay closed.
 result=result.replace('END $guard$;',"""IF (SELECT md5(prosrc) FROM pg_proc WHERE oid='public.rpc_cockpit_listar_esteira_v1(text,text[],text[],text[],boolean,date,date,boolean,integer,integer)'::regprocedure) IS DISTINCT FROM '36ef75405315a11e47fee042d6a575cb' THEN RAISE EXCEPTION 'READER_DRIFT'; END IF;
END $guard$;""")
 cockpit=(ROOT/'scripts/cockpit-status-renewal/postflight-readonly.sql').read_text()
 return result+cockpit[cockpit.index('DO $guard$'):cockpit.index("SELECT '36ef")]
def main():
 verify_protected()
 pre=guard();post=guard(True)
 header="-- REVIEW ONLY, NOT APPLIED. Canonical external Supabase only; no fixture writes.\nBEGIN;\nSET LOCAL lock_timeout='3s';\nSET LOCAL statement_timeout='15s';\n"
 (H/'preflight-readonly.sql').write_text('BEGIN READ ONLY;\n'+pre+"SELECT 'PRE PASS, supplemental SaaS/refresh review still required' result;\nROLLBACK;\n")
 (H/'postflight-readonly.sql').write_text('BEGIN READ ONLY;\n'+post+"SELECT 'POST PASS' result;\nROLLBACK;\n")
 # No release artifact: supplementary dependencies lack immutable observed fingerprints.
 # Candidate refuses execution rather than relying on a comment to block rollout.
 closed="DO $release$ BEGIN RAISE EXCEPTION 'PROGRAMAR_SUPPLEMENTAL_REVIEW_REQUIRED'; END $release$;\n"
 capture="CREATE TEMP TABLE programar_exact_baseline ON COMMIT PRESERVE ROWS AS SELECT pg_get_functiondef('public.rpc_programar_os_v1(uuid,text,date)'::regprocedure) definition;\n"
 (H/'candidate.sql.review').write_text(header+pre+closed+capture+(H/'rpc.sql.review').read_text()+post+'COMMIT;\n')
 # Same-session snapshot is authoritative; reconstructed body is reference only.
 # A future auditor-reviewed application must capture this before replacement.
 (H/'rollback.sql.review').write_text(header+post+"DO $restore$ DECLARE saved text; BEGIN\nIF to_regclass('pg_temp.programar_exact_baseline') IS NULL THEN RAISE EXCEPTION 'EXACT_BASELINE_NOT_CAPTURED'; END IF;\nSELECT definition INTO saved FROM pg_temp.programar_exact_baseline;\nIF md5(saved) IS DISTINCT FROM 'a42d6b07f51e6dacf41096f6cefb8163' THEN RAISE EXCEPTION 'BASELINE_DRIFT'; END IF;\nEXECUTE saved; END $restore$;\n"+pre+'COMMIT;\n')
 artifact_paths=[p for p in H.rglob('*') if p.is_file() and '__pycache__' not in p.parts and 'snapshot' not in p.parts and p.name not in ['manifest.json','SHA256SUMS']]
 manifest={'canonical_ref':'swzpzcwiasxmjutrmvkm','baseline_commit':BASELINE,'approval_commit':APPROVAL,'hosted_executed':False,'release_gate':'AUDITOR REVIEW REQUIRED: supplemental SaaS dependency catalog and global-refresh concurrency not certified; do not execute solely from local tests','runtime':{'path':UI,'pre':UI_PRE,'post':sha(ROOT/UI),'rollback':'rollback/OSDetalhesDialog.tsx'},'protected':json.loads((H/'protected.json').read_text()),'artifacts':{p.relative_to(H).as_posix():sha(p) for p in sorted(artifact_paths)}}
 (H/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
 (H/'SHA256SUMS').write_text(''.join(sha(p)+'  '+p.relative_to(H).as_posix()+'\n' for p in sorted(artifact_paths))+sha(H/'manifest.json')+'  manifest.json\n')
if __name__=='__main__':main()