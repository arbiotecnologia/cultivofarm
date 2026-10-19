#!/usr/bin/env python3
"""Restaura bytes de 0b964 (reintroduz URL assinada 300s/60s — fraqueza conhecida). Uso: rollback.py [--apply] [raiz]"""
import hashlib,json,os,shutil,sys
here=os.path.dirname(os.path.abspath(__file__)); apply="--apply" in sys.argv
root=([a for a in sys.argv[1:] if a!="--apply"] or ["."])[0]
m=json.load(open(os.path.join(here,"manifest.json"))); h=lambda p:hashlib.sha256(open(p,'rb').read()).hexdigest()
for f,v in m["modified"].items():
  cur=h(os.path.join(root,f))
  if cur not in (v["pre"],v["post"]): sys.exit(f"DRIFT {f}")
for f,v in m["added"].items():
  p=os.path.join(root,f)
  if os.path.exists(p) and h(p)!=v: sys.exit(f"DRIFT {f}")
if not apply: print("PREFLIGHT OK (dry-run)"); sys.exit()
for f in m["modified"]: shutil.copyfile(os.path.join(here,"baseline",f),os.path.join(root,f))
for f in m["added"]:
  p=os.path.join(root,f)
  if os.path.exists(p): os.remove(p)
for f,v in m["modified"].items(): assert h(os.path.join(root,f))==v["pre"]
print("ROLLBACK OK -> 0b964")
