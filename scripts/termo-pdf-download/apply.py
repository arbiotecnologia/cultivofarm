#!/usr/bin/env python3
"""Aplica a candidata (frontend+Edge+testes) sobre 6493e1. Uso: apply.py [--apply] [raiz]. Sem --apply: só preflight."""
import hashlib,json,os,shutil,sys
here=os.path.dirname(os.path.abspath(__file__)); go="--apply" in sys.argv
root=([a for a in sys.argv[1:] if a!="--apply"] or ["."])[0]
m=json.load(open(os.path.join(here,"manifest.json"))); h=lambda p:hashlib.sha256(open(p,'rb').read()).hexdigest()
for f,v in m["modified"].items():
  p=os.path.join(root,f)
  if not os.path.exists(p) or h(p)!=v["pre"]: sys.exit(f"DRIFT {f}")
  if h(os.path.join(here,"candidate",f))!=v["post"]: sys.exit(f"CANDIDATE DRIFT {f}")
for f,v in m["added"].items():
  if os.path.exists(os.path.join(root,f)): sys.exit(f"EXISTS {f}")
  if h(os.path.join(here,"candidate",f))!=v: sys.exit(f"CANDIDATE DRIFT {f}")
if not go: print("PREFLIGHT OK (dry-run)"); sys.exit()
for f in list(m["modified"])+list(m["added"]):
  d=os.path.join(root,f); os.makedirs(os.path.dirname(d),exist_ok=True); shutil.copyfile(os.path.join(here,"candidate",f),d)
for f,v in m["modified"].items(): assert h(os.path.join(root,f))==v["post"]
print("APPLY OK")
