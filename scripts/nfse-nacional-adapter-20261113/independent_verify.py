"""Verificação INDEPENDENTE do motor: XSD oficial DPS v1.01 (libxml2) e
assinatura XMLDSig por C14N do lxml/libxml2 + OpenSSL. Uso:
python3 independent_verify.py <signed.xml> <xsd_dir>  -> imprime JSON."""
import base64, hashlib, json, subprocess, sys, tempfile, os
from lxml import etree
path, xsd_dir = sys.argv[1], sys.argv[2]
NS = {"n": "http://www.sped.fazenda.gov.br/nfse", "ds": "http://www.w3.org/2000/09/xmldsig#"}
out = {}
doc = etree.parse(path)
schema = etree.XMLSchema(etree.parse(os.path.join(xsd_dir, "DPS_v1.01.xsd")))
out["xsd_valid"] = schema.validate(doc)
out["xsd_errors"] = [str(e)[:200] for e in schema.error_log][:5]
sig = doc.find(".//ds:Signature", NS)
inf = doc.find(".//n:infDPS", NS)
ref = sig.find(".//ds:Reference", NS).get("URI")
out["reference_matches_id"] = ref == "#" + inf.get("Id")
out["algorithms"] = [sig.find(".//ds:SignatureMethod", NS).get("Algorithm"), sig.find(".//ds:DigestMethod", NS).get("Algorithm")]
# enveloped: infDPS não contém a assinatura; C14N inclusiva do subconjunto
c14n = etree.tostring(inf, method="c14n", exclusive=False, with_comments=False)
out["digest_ok"] = base64.b64encode(hashlib.sha256(c14n).digest()).decode() == sig.find(".//ds:DigestValue", NS).text
si = etree.tostring(sig.find("ds:SignedInfo", NS), method="c14n", exclusive=False)
with tempfile.TemporaryDirectory() as t:
    cert = "-----BEGIN CERTIFICATE-----\n" + sig.find(".//ds:X509Certificate", NS).text + "\n-----END CERTIFICATE-----\n"
    open(f"{t}/c.pem", "w").write(cert)
    open(f"{t}/si", "wb").write(si)
    open(f"{t}/sv", "wb").write(base64.b64decode(sig.find("ds:SignatureValue", NS).text))
    subprocess.run(["openssl", "x509", "-in", f"{t}/c.pem", "-pubkey", "-noout", "-out", f"{t}/p.pem"], check=True)
    r = subprocess.run(["openssl", "dgst", "-sha256", "-verify", f"{t}/p.pem", "-signature", f"{t}/sv", f"{t}/si"], capture_output=True, text=True)
    out["openssl_signature_ok"] = r.returncode == 0 and "Verified OK" in r.stdout
print(json.dumps(out))
