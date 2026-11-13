"""Valida os XMLs sintéticos: NF-e contra PL_010g oficial (sem modificação); DPS HOMOLOGATION contra
produção restrita 20/10/2026 (sem modificação); DPS PRODUCTION contra 1.01 original e cópia /tmp com
a âncora TSSerieDPS corrigida (SCHEMA_ANCHOR_DEFECT), registradas separadamente."""
import os, sys, glob, shutil, tempfile, json, re, hashlib
from lxml import etree
H = os.path.dirname(os.path.abspath(__file__)); R = os.path.dirname(os.path.dirname(H))
NFE = os.path.join(R, "scripts/nfe-f41-certification-20261112/official/PL_010g")
HOM = os.path.join(R, "scripts/service-nfse-dps-profile-20261113/official/prod-restrita-20261020")
PROD = os.path.join(R, "scripts/nfse-nacional-adapter-20261113/official/xsd-1.01")
sch = lambda d, f: etree.XMLSchema(etree.parse(os.path.join(d, f)))
td = tempfile.mkdtemp(); [shutil.copy(os.path.join(PROD, f), td) for f in os.listdir(PROD)]
ts = os.path.join(td, "tiposSimples_v1.01.xsd"); b = open(ts, encoding="utf-8").read()
m = re.search(r'(<xs:simpleType name="TSSerieDPS">.*?<xs:pattern value=")([^"]*)(")', b, re.S)
open(ts, "w", encoding="utf-8").write(b[:m.start(2)] + m.group(2).lstrip("^").rstrip("$") + b[m.end(2):])
nfe, hom, po, pf = sch(NFE, "nfe_v4.00.xsd"), sch(HOM, "DPS_v1.01.xsd"), sch(PROD, "DPS_v1.01.xsd"), sch(td, "DPS_v1.01.xsd")
res, ok = {}, True
for f in sorted(glob.glob(os.path.join(H, "evidence/*.xml"))):
    n = os.path.basename(f); doc = etree.parse(f)
    if n.startswith("nfe-"):
        v = nfe.validate(doc); ok &= v; res[n] = {"xsd_nfe_PL_010g_original": v, "erros": [e.message for e in nfe.error_log][:3]}
    elif n.startswith("homolog-"):
        v = hom.validate(doc); ok &= v; res[n] = {"xsd_dps_homologacao_original": v, "erros": [e.message for e in hom.error_log][:3]}
    else:
        o, p = po.validate(doc), pf.validate(doc); ok &= p
        res[n] = {"xsd_dps_producao_original": o, "xsd_dps_producao_ancora_corrigida": p, "erros": [e.message for e in pf.error_log][:3]}
    res[n]["sha256"] = hashlib.sha256(open(f, "rb").read()).hexdigest()
shutil.rmtree(td); json.dump(res, open(os.path.join(H, "evidence/xsd-result.json"), "w"), ensure_ascii=False, indent=1)
print(json.dumps(res, ensure_ascii=False, indent=1)); sys.exit(0 if ok else 1)
