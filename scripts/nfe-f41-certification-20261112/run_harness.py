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
import base64, re, hashlib, json, os, shutil, subprocess, sys, tempfile, datetime
from pathlib import Path
from lxml import etree

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
ENGINE_XSD = ROOT / "supabase/functions/fiscal-xml-engine/xsd"
CURRENT_XSD = HERE / "official/PL_010g"
LEGACY_XSD = HERE / "official/PL_010e"
XSD_NAMES = ["DFeTiposBasicos_v1.00.xsd", "leiauteNFe_v4.00.xsd", "nfe_v4.00.xsd", "tiposBasico_v4.00.xsd", "xmldsig-core-schema_v1.01.xsd"]
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

def xsd_engine(xml_path):
    """Validador normativo do motor: Xerces-C++ WASM + bundle com integridade verificada."""
    r = deno("xsd", xml_path)[str(xml_path)]
    return bool(r["valid"]), "%s %s %s" % (r["package"], r["validator"].split(" ")[0], [i["code"] for i in r["issues"]])

def note(name, detail):
    """Divergência de ferramenta registrada como tal — nunca conta como OK."""
    results.append({"case": name, "expected": "-", "observed": "-", "result": "KNOWN_TOOL_DEFECT", "detail": str(detail)[:400]})
    print("NOTE", name, "-", str(detail)[:160])

def xsd_negative(P, name, path):
    ok, d = xsd_engine(path); check(P + name + ".xerces_motor", ok, d, expect=False)
    lok, ld = xsd_validate(path, ENGINE_XSD)
    if lok and not ok:
        note(P + name + ".libxml2", "libxml2 aceitou o que o Xerces normativo rejeitou: " + ld)
    else:
        check(P + name + ".libxml2", lok, ld, expect=False)

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
    if r.returncode:
        import re
        raise RuntimeError(re.sub(r"\x1b\[[0-9;]*m", "", r.stderr)[:600])
    return json.loads(r.stdout.strip().splitlines()[-1])

FIXTURES = {
    "icms20_mt": {"file": "synthetic-payload.json", "expect": {}},
    "mg_icms00": {"file": "synthetic-mg-icms00.json", "expect": {
        "cUF": "31", "idDest": "1", "indFinal": "1", "indIEDest": "9", "CFOP": "5101", "NCM": "48021000",
        "orig": "0", "CST": "00", "vProd": "1.00", "vNF": "1.00", "tpAmb": "2", "mod": "55", "UF": "MG"}},
}

def key_dv(k43):
    r = sum(int(c) * w for c, w in zip(reversed(k43), [2, 3, 4, 5, 6, 7, 8, 9] * 6)) % 11
    return 0 if r < 2 else 11 - r

def key_consistency(xml_bytes):
    """Chave de acesso (44): DV mod 11 e coerência com Id/cUF/mod/serie/nNF/tpEmis/cNF/cDV."""
    d = etree.fromstring(xml_bytes); inf = d.find(f"{{{NFE}}}infNFe"); n = lambda p: inf.findtext(p, namespaces={"n": NFE})
    k = (inf.get("Id") or "")[3:]
    if len(k) != 44 or not k.isdigit(): return False, "KEY_FORMAT"
    if int(k[43]) != key_dv(k[:43]): return False, "KEY_DV_INVALID"
    ide = {t: n(f"n:ide/n:{t}") for t in ["cUF", "mod", "serie", "nNF", "tpEmis", "cNF", "cDV"]}
    if (k[0:2], k[20:22], int(k[22:25]), int(k[25:34]), k[34], k[35:43], k[43]) != (
        ide["cUF"], ide["mod"], int(ide["serie"]), int(ide["nNF"]), ide["tpEmis"], ide["cNF"], ide["cDV"]):
        return False, "KEY_IDE_MISMATCH"
    if k[6:20] != n("n:emit/n:CNPJ"): return False, "KEY_CNPJ_MISMATCH"
    return True, "DV=%s" % k[43]

def fixture_fields(xml_bytes, expect):
    d = etree.fromstring(xml_bytes); ns = {"n": NFE}
    got = {"cUF": "n:infNFe/n:ide/n:cUF", "idDest": "n:infNFe/n:ide/n:idDest", "indFinal": "n:infNFe/n:ide/n:indFinal",
           "indIEDest": "n:infNFe/n:dest/n:indIEDest", "CFOP": "n:infNFe/n:det/n:prod/n:CFOP", "NCM": "n:infNFe/n:det/n:prod/n:NCM",
           "orig": "n:infNFe/n:det/n:imposto/n:ICMS/n:ICMS00/n:orig", "CST": "n:infNFe/n:det/n:imposto/n:ICMS/n:ICMS00/n:CST",
           "vProd": "n:infNFe/n:total/n:ICMSTot/n:vProd", "vNF": "n:infNFe/n:total/n:ICMSTot/n:vNF",
           "tpAmb": "n:infNFe/n:ide/n:tpAmb", "mod": "n:infNFe/n:ide/n:mod", "UF": "n:infNFe/n:emit/n:enderEmit/n:UF"}
    bad = {k: d.findtext(got[k], namespaces=ns) for k, v in expect.items() if d.findtext(got[k], namespaces=ns) != v}
    if expect and d.find("n:infNFe/n:dest/n:IE", ns) is not None: bad["dest.IE"] = "presente com indIEDest=9"
    return not bad, (bad or "campos conferidos")

def main():
    EVID.mkdir(exist_ok=True)
    tmp = Path(tempfile.mkdtemp(prefix="f41-"))
    try:
        # 1. Proveniência
        ok, d = provenance(CURRENT_XSD, HERE / "official/manifest-PL_010g.json"); check("prov.PL_010g_vigente.sha256", ok, d)
        ok, d = provenance(ENGINE_XSD, ENGINE_XSD / "manifest.json"); check("prov.motor_manifesto.sha256", ok, d)
        ok, d = provenance(LEGACY_XSD, HERE / "official/manifest-PL_010e.json"); check("prov.PL_010e_arquivo_compat.sha256", ok, d)
        em = json.loads((ENGINE_XSD / "manifest.json").read_text()); cm = json.loads((HERE / "official/manifest-PL_010g.json").read_text())
        check("prov.motor_manifesto_pacote_vigente", em["package_sha256"] == cm["package_sha256"], em["package"])
        diff = [n for n in XSD_NAMES if sha(CURRENT_XSD / n) != sha(ENGINE_XSD / n)]
        check("prov.motor_alinhado_ao_vigente", not diff, "difere: %s" % diff if diff else "5/5 idênticos")
        tampered = tmp / "xsd_t"; shutil.copytree(CURRENT_XSD, tampered)
        with open(tampered / "leiauteNFe_v4.00.xsd", "a") as f: f.write("<!-- t -->")
        ok, d = provenance(tampered, HERE / "official/manifest-PL_010g.json"); check("neg.prov.xsd_adulterado", ok, d, expect=False)

        def mkcert(tag, extra=("-days", "2")):
            k, c = tmp / f"{tag}.key", tmp / f"{tag}.pem"
            subprocess.run(["openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", str(k), "-out", str(c), *extra,
                            "-subj", f"/CN=F41 SINTETICO {tag}/O=FICTICIO"], check=True, capture_output=True)
            return c, k
        der = lambda c: subprocess.run(["openssl", "x509", "-in", str(c), "-outform", "DER"], capture_output=True, check=True).stdout
        cA, kA = mkcert("A"); cB, kB = mkcert("B"); derA, derB = der(cA), der(cB)
        variant_n = [0]
        def variant(data):
            variant_n[0] += 1; p = tmp / f"v{variant_n[0]}.xml"; p.write_bytes(data); return p

        for fx, spec in FIXTURES.items():
            P = f"{fx}."
            signed = tmp / f"{fx}.xml"
            meta = deno("sign", HERE / "fixtures" / spec["file"], cA, kA, signed)
            xml = signed.read_bytes(); s = xml.decode()
            (EVID / f"signed-{fx}.xml").write_bytes(xml)  # só certificado público efêmero
            check(P + "pos.motor.verifyNfeSignature", meta["selfVerify"]["valid"], meta["selfVerify"])
            ok, d = key_consistency(xml); check(P + "pos.chave_dv_coerente", ok, d)
            if spec["expect"]:
                ok, d = fixture_fields(xml, spec["expect"]); check(P + "pos.campos_fixture", ok, d)
            ok, d = xsd_engine(signed); check(P + "pos.xsd.xerces_motor_PL_010g", ok, d)
            ok, d = xsd_validate(signed, ENGINE_XSD); check(P + "pos.xsd.libxml2_motor_PL_010g", ok, d)
            ok, d = xsd_validate(signed, CURRENT_XSD); check(P + "pos.xsd.oficial_PL_010g", ok, d)
            ok, d = xsd_validate(signed, LEGACY_XSD); check(P + "pos.xsd.compat_PL_010e", ok, d)
            ok, d = independent_verify(xml, tmp, derA); check(P + "pos.sig.independente_libxml2_openssl", ok, d)

            vnf = re.search(r"<vNF>([^<]+)</vNF>", s).group(0)
            k = re.search(r'Id="NFe(\d{44})"', s).group(1)
            wrong_dv = k[:43] + str((int(k[43]) + 1) % 10)
            cases = {
                "neg.sig.valor_alterado_infNFe": s.replace(vnf, vnf.replace("<vNF>", "<vNF>9")),
                "neg.sig.signaturevalue_adulterado": s.replace("<SignatureValue>", "<SignatureValue>AAAA", 1),
                "neg.sig.uri_referencia_trocada": s.replace(f'URI="#NFe{k}"', f'URI="#NFe{wrong_dv}"', 1),
            }
            for name, data in cases.items():
                ok, d = independent_verify(data.encode(), tmp); check(P + name, ok, d, expect=False)
                mv = deno("verify", variant(data.encode())); check(P + name + ".motor", mv["valid"], mv["code"], expect=False)
            doc = etree.fromstring(xml)
            doc.find(f".//{{{DS}}}X509Certificate").text = base64.b64encode(derB).decode()
            swapped = etree.tostring(doc)
            ok, d = independent_verify(swapped, tmp); check(P + "neg.sig.certificado_substituido", ok, d, expect=False)
            ok, d = independent_verify(swapped, tmp, derA); check(P + "neg.sig.certificado_nao_esperado", ok, d, expect=False)
            nosig = s[: s.index("<Signature ")] + "</NFe>"
            xsd_negative(P, "neg.xsd.sem_signature", variant(nosig.encode()))
            ok, d = independent_verify(nosig.encode(), tmp); check(P + "neg.sig.ausente", ok, d, expect=False)
            cfop = re.search(r"<CFOP>(\d{4})</CFOP>", s).group(1)
            xsd_negative(P, "neg.xsd.cfop_invalido", variant(s.replace(f"<CFOP>{cfop}</CFOP>", "<CFOP>51A1</CFOP>").encode()))
            xsd_negative(P, "neg.xsd.tpAmb_invalido", variant(s.replace("<tpAmb>2</tpAmb>", "<tpAmb>3</tpAmb>").encode()))
            xsd_negative(P, "neg.xsd.ncm_9_digitos", variant(s.replace("<NCM>", "<NCM>1", 1).encode()))
            xsd_negative(P, "neg.xsd.ncm_letra", variant(re.sub(r"<NCM>(\d{7})\d</NCM>", r"<NCM>\1A</NCM>", s, count=1).encode()))
            ok, d = key_consistency(s.replace(f'Id="NFe{k}"', f'Id="NFe{wrong_dv}"').encode())
            check(P + "neg.chave_dv_incorreto", ok, d, expect=False)
            ok, d = key_consistency(s.replace(f"<cDV>{k[43]}</cDV>", f"<cDV>{wrong_dv[43]}</cDV>").encode())
            check(P + "neg.chave_cDV_divergente", ok, d, expect=False)
            if spec["expect"]:
                ok, d = fixture_fields(s.replace("<indFinal>1</indFinal>", "<indFinal>0</indFinal>").encode(), spec["expect"])
                check(P + "neg.campos_indFinal_divergente", ok, d, expect=False)

        ck, kk = mkcert("EXP", ("-not_before", "20200101000000Z", "-not_after", "20200102000000Z"))
        for name, (c, kf, code) in {"neg.sign.certificado_expirado": (ck, kk, "CERTIFICATE_EXPIRED"),
                                    "neg.sign.chave_nao_corresponde": (cA, kB, "CERTIFICATE_KEY_MISMATCH")}.items():
            try:
                deno("sign", HERE / "fixtures/synthetic-mg-icms00.json", c, kf, tmp / "x.xml"); check(name, True, "assinou")
            except RuntimeError as e:
                check(name, False, code if code in str(e) else str(e)[-160:], expect=False)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    tools = {k: subprocess.run(c, capture_output=True, text=True).stdout.strip().splitlines()[0] if subprocess.run(c, capture_output=True, text=True).stdout else
             subprocess.run(c, capture_output=True, text=True).stderr.strip().splitlines()[0]
             for k, c in {"xmllint": ["xmllint", "--version"], "openssl": ["openssl", "version"], "deno": ["deno", "--version"]}.items()}
    fails = [r for r in results if r["result"] == "FAIL"]
    notes = [r for r in results if r["result"] == "KNOWN_TOOL_DEFECT"]
    report = {"harness": "F4.1 NF-e 55 offline", "generated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
              "tools": tools, "lxml_libxml": list(etree.LIBXML_VERSION), "total": len(results), "failed": len(fails), "known_tool_defects": len(notes),
              "network_sefaz": False, "database": False, "secrets": False, "results": results}
    (EVID / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2))
    lines = [f"# F4.1 — execução {report['generated_at']}", "", f"Total {len(results)}, falhas {len(fails)}, divergências de ferramenta registradas {len(notes)}.", "",
             "| Caso | Esperado | Observado | Resultado | Detalhe |", "|---|---|---|---|---|"]
    lines += [f"| {r['case']} | {r['expected']} | {r['observed']} | {r['result']} | {r['detail'][:90].replace('|','/')} |" for r in results]
    (EVID / "REPORT-run.md").write_text("\n".join(lines) + "\n")
    print(f"\nTOTAL {len(results)} FALHAS {len(fails)} NOTAS {len(notes)}")
    return 1 if fails else 0

if __name__ == "__main__":
    sys.exit(main())
