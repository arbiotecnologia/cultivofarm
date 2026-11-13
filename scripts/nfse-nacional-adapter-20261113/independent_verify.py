"""Verificação INDEPENDENTE do motor: XSD oficial DPS v1.01 (libxml2) e
assinatura XMLDSig por C14N do lxml/libxml2 + OpenSSL. Uso:
python3 independent_verify.py <signed.xml> <xsd_dir>  -> imprime JSON."""
import base64, copy, hashlib, json, subprocess, sys, tempfile, os
from lxml import etree
path, xsd_dir = sys.argv[1], sys.argv[2]
NS = {"n": "http://www.sped.fazenda.gov.br/nfse", "ds": "http://www.w3.org/2000/09/xmldsig#"}
out = {}
doc = etree.parse(path)
import shutil
def validate(d):
    sc = etree.XMLSchema(etree.parse(os.path.join(d, "DPS_v1.01.xsd")))
    return sc.validate(doc), [str(e).split(":ERROR:", 1)[-1][:200] for e in sc.error_log][:5]
# 1) XSD oficial intocado.
out["xsd_official_valid"], out["xsd_official_errors"] = validate(xsd_dir)
# 2) Cópia derivada em /tmp: única alteração = TSSerieDPS "^0{0,4}\d{1,5}$" -> "0{0,4}\d{1,5}".
#    Em XSD, ^ e $ são literais (padrões já são ancorados); o validador .NET do
#    Sistema Nacional os trata como âncoras. Registrado como SCHEMA_ANCHOR_DEFECT.
with tempfile.TemporaryDirectory() as td:
    for f in os.listdir(xsd_dir): shutil.copy(os.path.join(xsd_dir, f), td)
    ts = os.path.join(td, "tiposSimples_v1.01.xsd"); body = open(ts, encoding="utf-8").read()
    assert body.count('value="^0{0,4}\\d{1,5}$"') == 1
    open(ts, "w", encoding="utf-8").write(body.replace('value="^0{0,4}\\d{1,5}$"', 'value="0{0,4}\\d{1,5}"'))
    out["xsd_valid"], out["xsd_errors"] = validate(td)
sig = doc.find(".//ds:Signature", NS)
inf = doc.find(".//n:infDPS", NS)
ref = sig.find(".//ds:Reference", NS).get("URI")
out["reference_matches_id"] = ref == "#" + inf.get("Id")
out["algorithms"] = [sig.find(".//ds:SignatureMethod", NS).get("Algorithm"), sig.find(".//ds:DigestMethod", NS).get("Algorithm")]
# enveloped: infDPS não contém a assinatura; C14N inclusiva do subconjunto
# Subconjunto renderizado como documento próprio (deepcopy): tostring(c14n) em
# nó interno do lxml emite xmlns="" espúrio (mesma técnica do harness NF-e F4.1).
def c14n(el): return etree.tostring(etree.ElementTree(copy.deepcopy(el)), method="c14n", exclusive=False, with_comments=False)
c14n_inf = c14n(inf)
out["digest_ok"] = base64.b64encode(hashlib.sha256(c14n_inf).digest()).decode() == sig.find(".//ds:DigestValue", NS).text
si = c14n(sig.find("ds:SignedInfo", NS))
with tempfile.TemporaryDirectory() as t:
    cert = "-----BEGIN CERTIFICATE-----\n" + sig.find(".//ds:X509Certificate", NS).text + "\n-----END CERTIFICATE-----\n"
    open(f"{t}/c.pem", "w").write(cert)
    open(f"{t}/si", "wb").write(si)
    open(f"{t}/sv", "wb").write(base64.b64decode(sig.find("ds:SignatureValue", NS).text))
    subprocess.run(["openssl", "x509", "-in", f"{t}/c.pem", "-pubkey", "-noout", "-out", f"{t}/p.pem"], check=True)
    r = subprocess.run(["openssl", "dgst", "-sha256", "-verify", f"{t}/p.pem", "-signature", f"{t}/sv", f"{t}/si"], capture_output=True, text=True)
    out["openssl_signature_ok"] = r.returncode == 0 and "Verified OK" in r.stdout
print(json.dumps(out))
