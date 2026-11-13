"""Valida as DPS geradas contra o XSD oficial 1.01 (SHA-256 no manifest) e contra cópia /tmp
com o único ajuste do defeito de âncora TSSerieDPS (SCHEMA_ANCHOR_DEFECT)."""
import os, sys, glob, shutil, tempfile, json
from lxml import etree
H = os.path.dirname(os.path.abspath(__file__)); XSD = os.path.join(H, "../nfse-nacional-adapter-20261113/official/xsd-1.01")
def schema(d): return etree.XMLSchema(etree.parse(os.path.join(d, "DPS_v1.01.xsd")))
td = tempfile.mkdtemp(); [shutil.copy(os.path.join(XSD, f), td) for f in os.listdir(XSD)]
ts = os.path.join(td, "tiposSimples_v1.01.xsd"); b = open(ts, encoding="utf-8").read()
import re
m = re.search(r'(<xs:simpleType name="TSSerieDPS">.*?<xs:pattern value=")([^"]*)(")', b, re.S)
fixed = m.group(2).lstrip("^").rstrip("$")
open(ts, "w", encoding="utf-8").write(b[:m.start(2)] + fixed + b[m.end(2):])
off, pat = schema(XSD), schema(td); res = {}
for f in sorted(glob.glob(os.path.join(H, "evidence/*.xml"))):
    doc = etree.parse(f); o = off.validate(doc); p = pat.validate(doc)
    res[os.path.basename(f)] = {"xsd_oficial": o, "xsd_oficial_erros": [e.message for e in off.error_log][:3], "xsd_ancora_corrigida": p, "erros": [e.message for e in pat.error_log][:5]}
shutil.rmtree(td); print(json.dumps({"serie_pattern_original": m.group(2), **res}, ensure_ascii=False, indent=1))
sys.exit(0 if all(v["xsd_ancora_corrigida"] for k, v in res.items() if isinstance(v, dict)) else 1)
