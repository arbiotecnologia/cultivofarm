"""Valida SOMENTE a árvore infNFe contra o tipo oficial TInfNFe (PL_010g, leiauteNFe_v4.00.xsd sem
modificação), sem inserir/forjar Signature. Wrapper: schema no mesmo namespace que inclui o leiaute
e declara um elemento global infNFe do tipo TInfNFe. Uso: python3 validate_infnfe.py <xml>..."""
import sys, os, json, hashlib, tempfile
from lxml import etree
H = os.path.dirname(os.path.abspath(__file__)); D = os.path.abspath(os.path.join(H, "../nfe-f41-certification-20261112/official/PL_010g"))
NS = "http://www.portalfiscal.inf.br/nfe"
w = f'''<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns="{NS}" targetNamespace="{NS}" elementFormDefault="qualified">
<xs:include schemaLocation="leiauteNFe_v4.00.xsd"/><xs:element name="infNFe" type="TInfNFe"/></xs:schema>'''
t = os.path.join(tempfile.mkdtemp(), "w.xsd"); open(t, "w").write(w)
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
