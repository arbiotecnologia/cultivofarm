"""Valida os XMLs retornados pela pré-visualização (UI/gerador) no XSD NF-e PL_010g oficial sem modificação.
A pré-visualização não assina; para o XSD exigir o elemento, insere-se uma assinatura ESTRUTURAL placeholder
(não é prova criptográfica). Uso: python3 validate_preview.py <xml>..."""
import sys, os, json, hashlib
from lxml import etree
H = os.path.dirname(os.path.abspath(__file__)); R = os.path.abspath(os.path.join(H, "../.."))
nfe = etree.XMLSchema(etree.parse(os.path.join(R, "scripts/nfe-f41-certification-20261112/official/PL_010g/nfe_v4.00.xsd")))
SIG = open(os.path.join(H, "gen_xml.ts"), encoding="utf-8").read().split("const SIG = `", 1)[1].split("`;", 1)[0]
out = {}
for f in sys.argv[1:]:
    x = open(f, encoding="utf-8").read()
    s = x.replace("</infNFe>", "</infNFe>" + SIG, 1)
    ok = nfe.validate(etree.fromstring(s.encode()))
    out[os.path.basename(f)] = {"xsd_nfe_PL_010g_original": ok, "erros": [e.message for e in nfe.error_log][:3], "sha256": hashlib.sha256(x.encode()).hexdigest(),
      "idDest": x.split("<idDest>")[1][:1], "CFOP": x.split("<CFOP>")[1][:4], "UF_dest": x.split("<enderDest>")[1].split("<UF>")[1][:2], "tem_IBSCBS": "<IBSCBS>" in x}
json.dump(out, open(os.path.join(H, "evidence/preview/xsd-preview-result.json"), "w"), ensure_ascii=False, indent=1)
print(json.dumps(out, ensure_ascii=False, indent=1)); sys.exit(0 if all(v["xsd_nfe_PL_010g_original"] for v in out.values()) else 1)
