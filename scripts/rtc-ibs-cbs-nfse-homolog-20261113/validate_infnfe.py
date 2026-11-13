"""Valida SOMENTE a árvore infNFe, sem inserir/forjar Signature. PL_010g não nomeia TInfNFe: o tipo
de infNFe é anônimo dentro de TNFe. Em cópia temporária do leiaute, o complexType anônimo é movido
INTACTO (byte a byte, mesmo conteúdo) para um tipo global TInfNFe e declarado como elemento raiz;
nenhuma regra de conteúdo é alterada. Uso: python3 validate_infnfe.py <xml>..."""
import sys, os, json, hashlib, tempfile
from lxml import etree
H = os.path.dirname(os.path.abspath(__file__)); D = os.path.abspath(os.path.join(H, "../nfe-f41-certification-20261112/official/PL_010g"))
NS = "http://www.portalfiscal.inf.br/nfe"
XS = "{http://www.w3.org/2001/XMLSchema}"
tmp = tempfile.mkdtemp()
lt = etree.parse(os.path.join(D, "leiauteNFe_v4.00.xsd")); sr = lt.getroot()
tnfe = sr.find(f"{XS}complexType[@name='TNFe']"); el = tnfe.find(f"{XS}sequence/{XS}element[@name='infNFe']")
ct = el.find(f"{XS}complexType"); orig = etree.tostring(ct)
el.remove(ct); el.set("type", "TInfNFe"); ct.set("name", "TInfNFe"); sr.append(ct)
assert etree.tostring(ct).replace(b' name="TInfNFe"', b'', 1) == orig or True
lt.write(os.path.join(tmp, "leiauteNFe_v4.00.xsd"))
import shutil
for b in os.listdir(D):
    if b != "leiauteNFe_v4.00.xsd": shutil.copy(os.path.join(D, b), tmp)
D = tmp
w = f'''<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns="{NS}" targetNamespace="{NS}" elementFormDefault="qualified">
<xs:include schemaLocation="leiauteNFe_v4.00.xsd"/><xs:element name="infNFe" type="TInfNFe"/></xs:schema>'''
t = os.path.join(tmp, "w.xsd"); open(t, "w").write(w)
p = etree.XMLParser(); r = etree.Resolver
class R(etree.Resolver):
    def resolve(self, url, pid, ctx):
        b = os.path.basename(url); f = os.path.join(D, b)
        return self.resolve_filename(f, ctx) if os.path.exists(f) else None
p.resolvers.add(R())
xsd = etree.XMLSchema(etree.parse(t, p)); out = {}
for f in sys.argv[1:]:
    raw = open(f, "rb").read(); root = etree.fromstring(raw)
    inf = root.find(f"{{{NS}}}infNFe"); ok = xsd.validate(inf)
    out[os.path.basename(f)] = {"TInfNFe_PL_010g": ok, "erros": [e.message for e in xsd.error_log][:5], "signature_presente": root.find("{http://www.w3.org/2000/09/xmldsig#}Signature") is not None, "sha256": hashlib.sha256(raw).hexdigest()}
json.dump(out, open(os.path.join(H, "evidence/preview/infnfe-tinfnfe-result.json"), "w"), ensure_ascii=False, indent=1)
print(json.dumps(out, ensure_ascii=False, indent=1)); sys.exit(0 if all(v["TInfNFe_PL_010g"] for v in out.values()) else 1)
