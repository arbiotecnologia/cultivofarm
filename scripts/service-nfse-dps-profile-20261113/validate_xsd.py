"""HOMOLOGATION: valida contra o pacote oficial de produção restrita 20/10/2026 SEM modificação
(SHA-256 conferido no manifest). PRODUCTION: acompanha o pacote 1.01 de 09/02/2026; lá o único
ajuste é a âncora TSSerieDPS em cópia /tmp (SCHEMA_ANCHOR_DEFECT), registrado separadamente."""
import os, sys, glob, shutil, tempfile, json, re, hashlib
from lxml import etree
H = os.path.dirname(os.path.abspath(__file__))
HOM = os.path.join(H, "official/prod-restrita-20261020")
PROD = os.path.join(H, "../nfse-nacional-adapter-20261113/official/xsd-1.01")
def schema(d): return etree.XMLSchema(etree.parse(os.path.join(d, "DPS_v1.01.xsd")))
td = tempfile.mkdtemp(); [shutil.copy(os.path.join(PROD, f), td) for f in os.listdir(PROD)]
ts = os.path.join(td, "tiposSimples_v1.01.xsd"); b = open(ts, encoding="utf-8").read()
m = re.search(r'(<xs:simpleType name="TSSerieDPS">.*?<xs:pattern value=")([^"]*)(")', b, re.S)
open(ts, "w", encoding="utf-8").write(b[:m.start(2)] + m.group(2).lstrip("^").rstrip("$") + b[m.end(2):])
hom, prod_orig, prod_fix = schema(HOM), schema(PROD), schema(td); res = {}; ok = True
for f in sorted(glob.glob(os.path.join(H, "evidence/*.xml"))):
    n = os.path.basename(f); doc = etree.parse(f)
    if n.startswith("homolog-"):
        v = hom.validate(doc); ok &= v
        res[n] = {"xsd_homologacao_original": v, "erros": [e.message for e in hom.error_log][:3]}
    else:
        o, p = prod_orig.validate(doc), prod_fix.validate(doc); ok &= p
        res[n] = {"xsd_producao_original": o, "xsd_producao_ancora_corrigida": p, "erros": [e.message for e in prod_fix.error_log][:3]}
    res[n]["sha256"] = hashlib.sha256(open(f, "rb").read()).hexdigest()
shutil.rmtree(td); print(json.dumps(res, ensure_ascii=False, indent=1)); sys.exit(0 if ok else 1)
