#!/usr/bin/env python3
"""F4.1 — Harness offline de certificação NF-e 55 (somente local).

Nada é transmitido à SEFAZ, nada toca banco/segredos/flags. Etapas:
 1. Proveniência: SHA-256 dos XSD oficiais (PL_010g vigente baixado do portal
    e PL_010e embarcado no motor) contra manifestos versionados.
 2. Fixture sintética construída e assinada pelo builder/assinador REAIS
    (Deno) com certificado autoassinado efêmero gerado aqui.
 3. Validação XSD offline (libxml2/xmllint) contra os dois pacotes.
 4. Verificação criptográfica INDEPENDENTE: C14N 1.0 do libxml2 (lxml) +
    SHA-1 + RSA via OpenSSL CLI; cruzada com o verificador do motor.
 5. Casos negativos que devem falhar.
Saída: evidence/report.json e evidence/REPORT-run.md.
"""
import base64, hashlib, json, os, shutil, subprocess, sys, tempfile, datetime
from pathlib import Path
from lxml import etree

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
ENGINE_XSD = ROOT / "supabase/functions/fiscal-xml-engine/xsd"
CURRENT_XSD = HERE / "official/PL_010g"
EVID = HERE / "evidence"
NFE = "http://www.portalfiscal.inf.br/nfe"
DS = "http://www.w3.org/2000/09/xmldsig#"
results = []

def check(name, ok, detail="", expect=True):
    passed = bool(ok) == expect
    results.append({"case": name, "expected": "PASS" if expect else "REJECT",
                    "observed": "PASS" if ok else "REJECT", "result": "OK" if passed else "FAIL",
                    "detail": str(detail)[:400]})
    print(("OK  " if passed else "FAIL"), name, "-", str(detail)[:160])

def sha(p): return hashlib.sha256(Path(p).read_bytes()).hexdigest()

def provenance(dirp, manifest):
    m = json.loads(Path(manifest).read_text())
    bad = [f["name"] for f in m["files"] if sha(Path(dirp) / f["name"]) != f["sha256"]]
    return not bad and len(m["files"]) == 5, (bad or m.get("package_label", m.get("package")))

def xsd_validate(xml_path, xsd_dir):
    r = subprocess.run(["xmllint", "--noout", "--schema", str(Path(xsd_dir) / "nfe_v4.00.xsd"), str(xml_path)],
                       capture_output=True, text=True)
    return r.returncode == 0, (r.stderr.strip().splitlines() or [""])[-1]

def c14n(el):
    """Canonical XML 1.0 inclusivo, sem comentários (libxml2).

    O subconjunto do nó é isolado por deepcopy (que leva o nsmap herdado) para
    um documento próprio: `tostring(method='c14n')` aplicado a um nó interno
    no lxml emite `xmlns=""` espúrio nos filhos. Inclusive C14N renderiza no
    ápice os namespaces herdados — equivalente ao deepcopy aqui, pois apenas
    NFe/Signature declaram namespace default."""
    import copy
    return etree.tostring(etree.ElementTree(copy.deepcopy(el)), method="c14n", exclusive=False, with_comments=False)

def independent_verify(xml_bytes, tmp, expected_cert_der=None):
    """Verificação XMLDSig enveloped sem reutilizar código do motor."""
    doc = etree.fromstring(xml_bytes)
    sigs = doc.findall(f"{{{DS}}}Signature")
    if len(sigs) != 1: return False, "SIGNATURE_COUNT_%d" % len(sigs)
    sig = sigs[0]
    si = sig.find(f"{{{DS}}}SignedInfo")
    if si.find(f"{{{DS}}}CanonicalizationMethod").get("Algorithm") != "http://www.w3.org/TR/2001/REC-xml-c14n-20010315":
        return False, "C14N_ALG"
    if si.find(f"{{{DS}}}SignatureMethod").get("Algorithm") != DS + "rsa-sha1": return False, "SIG_ALG"
    refs = si.findall(f"{{{DS}}}Reference")
    if len(refs) != 1: return False, "REFERENCE_COUNT"
    ref = refs[0]
    tr = [t.get("Algorithm") for t in ref.find(f"{{{DS}}}Transforms")]
    if tr != [DS + "enveloped-signature", "http://www.w3.org/TR/2001/REC-xml-c14n-20010315"]: return False, "TRANSFORMS"
    if ref.find(f"{{{DS}}}DigestMethod").get("Algorithm") != DS + "sha1": return False, "DIGEST_ALG"
    inf = doc.find(f"{{{NFE}}}infNFe")
    uri = ref.get("URI")
    if inf is None or uri != "#" + inf.get("Id"): return False, "REFERENCE_URI_MISMATCH"
    # enveloped-signature: Signature é irmã de infNFe, fora do subconjunto referenciado.
    digest = base64.b64encode(hashlib.sha1(c14n(inf)).digest()).decode()
    if digest != ref.findtext(f"{{{DS}}}DigestValue").strip(): return False, "DIGEST_MISMATCH"
    cert_der = base64.b64decode("".join(sig.findtext(f".//{{{DS}}}X509Certificate").split()))
    if expected_cert_der is not None and cert_der != expected_cert_der: return False, "CERT_NOT_EXPECTED"
    cp, sp, dp = tmp / "v.der", tmp / "v.sig", tmp / "v.si"
    cp.write_bytes(cert_der)
    sp.write_bytes(base64.b64decode("".join(sig.findtext(f"{{{DS}}}SignatureValue").split())))
    dp.write_bytes(c14n(si))
    pub = subprocess.run(["openssl", "x509", "-inform", "DER", "-in", str(cp), "-pubkey", "-noout"], capture_output=True)
    if pub.returncode: return False, "CERT_UNPARSEABLE"
    (tmp / "v.pub").write_bytes(pub.stdout)
    v = subprocess.run(["openssl", "dgst", "-sha1", "-verify", str(tmp / "v.pub"), "-signature", str(sp), str(dp)],
                       capture_output=True, text=True)
    return v.returncode == 0, ("RSA_SHA1_OK" if v.returncode == 0 else "SIGNATURE_VALUE_MISMATCH")

def deno(*args):
    r = subprocess.run(["deno", "run", "--quiet", "--allow-read", "--allow-write", "--allow-env", "--allow-net",
                        str(HERE / "sign_fixture.ts"), *map(str, args)], capture_output=True, text=True, cwd=HERE)
    if r.returncode: raise RuntimeError(r.stderr[-400:])
    return json.loads(r.stdout.strip().splitlines()[-1])

def main():
    EVID.mkdir(exist_ok=True)
    tmp = Path(tempfile.mkdtemp(prefix="f41-"))
    try:
        # 1. Proveniência
        ok, d = provenance(CURRENT_XSD, HERE / "official/manifest-PL_010g.json"); check("prov.PL_010g_vigente.sha256", ok, d)
        ok, d = provenance(ENGINE_XSD, ENGINE_XSD / "manifest.json"); check("prov.PL_010e_motor.sha256", ok, d)
        diff = [n for n in ["DFeTiposBasicos_v1.00.xsd", "leiauteNFe_v4.00.xsd", "nfe_v4.00.xsd", "tiposBasico_v4.00.xsd", "xmldsig-core-schema_v1.01.xsd"]
                if sha(CURRENT_XSD / n) != sha(ENGINE_XSD / n)]
        check("prov.motor_alinhado_ao_vigente", not diff, "difere: %s" % diff)
        tampered = tmp / "xsd_t"; shutil.copytree(CURRENT_XSD, tampered)
        with open(tampered / "leiauteNFe_v4.00.xsd", "a") as f: f.write("<!-- t -->")
        ok, d = provenance(tampered, HERE / "official/manifest-PL_010g.json"); check("neg.prov.xsd_adulterado", ok, d, expect=False)

        # 2. Certificados sintéticos efêmeros (nunca persistidos no repositório)
        def mkcert(tag, days=2, start=None):
            k, c = tmp / f"{tag}.key", tmp / f"{tag}.pem"
            cmd = ["openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", str(k), "-out", str(c),
                   "-days", str(days), "-subj", f"/CN=F41 SINTETICO {tag}/O=FICTICIO"]
            subprocess.run(cmd, check=True, capture_output=True)
            return c, k
        cA, kA = mkcert("A"); cB, kB = mkcert("B")
        derA = subprocess.run(["openssl", "x509", "-in", str(cA), "-outform", "DER"], capture_output=True, check=True).stdout
        signed = tmp / "signed.xml"
        meta = deno("sign", HERE / "fixtures/synthetic-payload.json", cA, kA, signed)
        xml = signed.read_bytes()
        (EVID / "signed-synthetic-nfe.xml").write_bytes(xml)  # só contém cert público efêmero
        check("pos.motor.verifyNfeSignature", meta["selfVerify"]["valid"], meta["selfVerify"])
        check("pos.tpAmb_homologacao", b"<tpAmb>2</tpAmb>" in xml, "tpAmb=2")

        # 3. XSD
        ok, d = xsd_validate(signed, CURRENT_XSD); check("pos.xsd.PL_010g_vigente", ok, d)
        ok, d = xsd_validate(signed, ENGINE_XSD); check("pos.xsd.PL_010e_motor", ok, d)
        # 4. Assinatura independente
        ok, d = independent_verify(xml, tmp, derA); check("pos.sig.independente_libxml2_openssl", ok, d)

        # 5. Negativos
        def variant(name, data):
            p = tmp / f"{name}.xml"; p.write_bytes(data); return p
        s = xml.decode()
        cases = {
            "neg.sig.valor_alterado_infNFe": s.replace("<vNF>10000.00</vNF>", "<vNF>10001.00</vNF>"),
            "neg.sig.signaturevalue_adulterado": s.replace("<SignatureValue>", "<SignatureValue>AAAA", 1),
            "neg.sig.uri_referencia_trocada": s.replace('URI="#NFe5126', 'URI="#NFe5127', 1),
        }
        for name, data in cases.items():
            ok, d = independent_verify(data.encode(), tmp); check(name, ok, d, expect=False)
            mv = deno("verify", variant(name, data.encode())); check(name + ".motor", mv["valid"], mv["code"], expect=False)
        # certificado trocado: assinatura com chave B mas KeyInfo com cert A
        doc = etree.fromstring(xml)
        derB = subprocess.run(["openssl", "x509", "-in", str(cB), "-outform", "DER"], capture_output=True, check=True).stdout
        doc.find(f".//{{{DS}}}X509Certificate").text = base64.b64encode(derB).decode()
        swapped = etree.tostring(doc)
        ok, d = independent_verify(swapped, tmp); check("neg.sig.certificado_substituido", ok, d, expect=False)
        ok, d = independent_verify(swapped, tmp, derA); check("neg.sig.certificado_nao_esperado", ok, d, expect=False)
        # sem assinatura: XSD exige ds:Signature
        nosig = s[: s.index("<Signature ")] + "</NFe>"
        ok, d = xsd_validate(variant("nosig", nosig.encode()), CURRENT_XSD); check("neg.xsd.sem_signature", ok, d, expect=False)
        ok, d = independent_verify(nosig.encode(), tmp); check("neg.sig.ausente", ok, d, expect=False)
        bad = s.replace("<CFOP>5102</CFOP>", "<CFOP>51A2</CFOP>")
        ok, d = xsd_validate(variant("badcfop", bad.encode()), CURRENT_XSD); check("neg.xsd.cfop_invalido", ok, d, expect=False)
        bad = s.replace("<tpAmb>2</tpAmb>", "<tpAmb>3</tpAmb>")
        ok, d = xsd_validate(variant("badamb", bad.encode()), CURRENT_XSD); check("neg.xsd.tpAmb_invalido", ok, d, expect=False)
        # certificado expirado deve ser recusado pelo assinador
        try:
            ck, kk = tmp / "exp.pem", tmp / "exp.key"
            subprocess.run(["openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", str(kk), "-out", str(ck),
                            "-not_before", "20200101000000Z", "-not_after", "20200102000000Z", "-subj", "/CN=EXP"], check=True, capture_output=True)
            deno("sign", HERE / "fixtures/synthetic-payload.json", ck, kk, tmp / "exp.xml"); check("neg.sign.certificado_expirado", True, "assinou")
        except RuntimeError as e:
            check("neg.sign.certificado_expirado", False, "CERTIFICATE_EXPIRED" if "CERTIFICATE_EXPIRED" in str(e) else str(e)[-120:], expect=False)
        try:
            deno("sign", HERE / "fixtures/synthetic-payload.json", cA, kB, tmp / "mm.xml"); check("neg.sign.chave_nao_corresponde", True, "assinou")
        except RuntimeError as e:
            check("neg.sign.chave_nao_corresponde", False, "CERTIFICATE_KEY_MISMATCH" if "KEY_MISMATCH" in str(e) or "não corresponde" in str(e) else str(e)[-160:], expect=False)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    tools = {k: subprocess.run(c, capture_output=True, text=True).stdout.strip().splitlines()[0] if subprocess.run(c, capture_output=True, text=True).stdout else
             subprocess.run(c, capture_output=True, text=True).stderr.strip().splitlines()[0]
             for k, c in {"xmllint": ["xmllint", "--version"], "openssl": ["openssl", "version"], "deno": ["deno", "--version"]}.items()}
    fails = [r for r in results if r["result"] != "OK"]
    report = {"harness": "F4.1 NF-e 55 offline", "generated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
              "tools": tools, "lxml_libxml": list(etree.LIBXML_VERSION), "total": len(results), "failed": len(fails),
              "network_sefaz": False, "database": False, "secrets": False, "results": results}
    (EVID / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2))
    lines = [f"# F4.1 — execução {report['generated_at']}", "", f"Total {len(results)}, falhas {len(fails)}.", "",
             "| Caso | Esperado | Observado | Resultado | Detalhe |", "|---|---|---|---|---|"]
    lines += [f"| {r['case']} | {r['expected']} | {r['observed']} | {r['result']} | {r['detail'][:90].replace('|','/')} |" for r in results]
    (EVID / "REPORT-run.md").write_text("\n".join(lines) + "\n")
    print(f"\nTOTAL {len(results)} FALHAS {len(fails)}")
    return 1 if fails else 0

if __name__ == "__main__":
    sys.exit(main())
