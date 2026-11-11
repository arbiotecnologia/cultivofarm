#!/usr/bin/env python3
"""Mede os MD5 (pg_get_functiondef) do candidate.sql no espelho descartável e grava candidate-md5.json. Nunca hospedado."""
import json,sys
from pathlib import Path
H=Path(__file__).resolve().parent;sys.path.insert(0,str(H))
import fixture as X
m=X.Mirror(55822);d=m.d
try:
    m.install_reported_stack()
    r=d.raw("BEGIN;\n"+(H/'candidate.sql').read_text()+"\nCOMMIT;")
    if r.returncode: raise SystemExit(r.stderr[-1500:])
    sigs=["platform_private.c2_pilot_econ_immutable_v1()","platform_private.c2_pilot_forecast_insert_barrier_v1()","platform_private.c2_pilot_econ_evidence_v1(uuid)",
          "platform_private.c2_pilot_econ_actor_v1(text)","platform_private.c2_pilot_econ_approve_core_v1(uuid,text,text,text,text)",
          "public.c2_pilot_economic_approve_v1(uuid,text,text,text,text)","public.c2_pilot_economic_state_v1(uuid)"]
    (H/'candidate-md5.json').write_text(json.dumps({s:d.md5(s) for s in sigs},indent=1)+"\n");print((H/'candidate-md5.json').read_text())
finally:
    pass
