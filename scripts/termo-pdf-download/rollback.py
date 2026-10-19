#!/usr/bin/env python3
"""Restaura bytes de 6493e1 (reintroduz signed_url 120s e getClaims com SDK 2.45.0 — fraqueza/defeito conhecidos). Uso: rollback.py [--apply] [raiz]"""
import hashlib,json,os,shutil,sys
here=os.path.dirname(os.path.abspath(__file__)); go="--apply" in sys.argv
root=([a for a in sys.argv[1:] if a!="--apply"] or ["."])[0]
m=json.load(open(os.path.join(here,"manifest.json"))); h=lambda p:hashlib.sha256(open(p,'rb').read()).hexdigest()
for f,v in m["modified"].items():
  p=os.path.join(root,f); cur=h(p) if os.path.exists(p) else None
  if cur not in (v["pre"],v["post"]): sys.exit(f"DRIFT {f}")
  if h(os.path.join(here,"baseline",f))!=v["pre"]: sys.exit(f"BASELINE DRIFT {f}")
for f,v in m["added"].items():
  p=os.path.join(root,f)
  if os.path.exists(p) and h(p)!=v: sys.exit(f"DRIFT {f}")
if not go: print("PREFLIGHT OK (dry-run)"); sys.exit()
for f in m["modified"]: shutil.copyfile(os.path.join(here,"baseline",f),os.path.join(root,f))
for f in m["added"]:
  p=os.path.join(root,f)
  if os.path.exists(p): os.remove(p)
for f,v in m["modified"].items(): assert h(os.path.join(root,f))==v["pre"]
print("ROLLBACK OK -> 6493e1")
