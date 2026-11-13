/**
 * Assinatura XMLDSig enveloped da DPS (NFS-e Nacional) com o A1 do próprio
 * emitente. Referência única URI="#<Id de infDPS>", transforms
 * enveloped-signature + C14N 1.0, RSA-SHA256/SHA-256, KeyInfo com o
 * X509Certificate. `Signature` fica após `infDPS`, dentro de `DPS`
 * (TCDPS: infDPS seguido de ds:Signature).
 *
 * Regras E0714/E0715/E0718 (Anexo I v1.01): validade do certificado e
 * assinatura pelo próprio emitente — o CNPJ ICP-Brasil (OID 2.16.76.1.3.3) do
 * certificado deve ser o CNPJ do prestador. A chave privada existe só em
 * memória durante a chamada; nunca é logada, retornada nem persistida.
 */
import forge from "npm:node-forge@1";
import { NFSE_NAMESPACE } from "./dps.ts";

export class DpsSignError extends Error {
  constructor(readonly code: string, message?: string) { super(message ?? code); this.name = "DpsSignError"; }
}
export interface DpsSigningMaterial { certPem: string; keyPem: string }
const DSIG = "http://www.w3.org/2000/09/xmldsig#";
const C14N = "http://www.w3.org/TR/2001/REC-xml-c14n-20010315";

/** C14N do subconjunto infDPS para o XML gerado por buildDpsXml (sem espaços,
 * comentários, PI ou CDATA; único namespace default herdado de DPS). */
export function canonicalizeInfDps(xml: string): string {
  const s = xml.indexOf("<infDPS "); const e = xml.indexOf("</infDPS>");
  if (s < 0 || e < 0) throw new DpsSignError("DPS_SIGN_NO_INFDPS");
  const frag = xml.slice(s, e + "</infDPS>".length);
  if (/<!--|<\?|<!\[CDATA\[|xmlns[:=]/.test(frag)) throw new DpsSignError("DPS_SIGN_UNSUPPORTED_CONTENT");
  return frag.replace("<infDPS ", `<infDPS xmlns="${NFSE_NAMESPACE}" `);
}

function signedInfo(id: string, digest: string): string {
  return `<SignedInfo xmlns="${DSIG}"><CanonicalizationMethod Algorithm="${C14N}"></CanonicalizationMethod>` +
    `<SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"></SignatureMethod>` +
    `<Reference URI="#${id}"><Transforms><Transform Algorithm="${DSIG}enveloped-signature"></Transform>` +
    `<Transform Algorithm="${C14N}"></Transform></Transforms>` +
    `<DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"></DigestMethod>` +
    `<DigestValue>${digest}</DigestValue></Reference></SignedInfo>`;
}

/** CNPJ ICP-Brasil do titular: OtherName 2.16.76.1.3.3 no subjectAltName. */
export function certificateCnpj(cert: forge.pki.Certificate): string | null {
  const ext = cert.getExtension("subjectAltName") as { value?: string } | null;
  const raw = ext?.value;
  if (!raw) return null;
  const oid = forge.asn1.oidToDer("2.16.76.1.3.3").getBytes();
  const at = raw.indexOf(oid);
  if (at < 0) return null;
  const m = raw.slice(at + oid.length).match(/(\d{14})/);
  return m?.[1] ?? null;
}

export interface DpsSignResult {
  signedXml: string;
  metadata: { referenceUri: string; algorithm: "RSA-SHA256"; certificateFingerprintSha256: string; certificateNotAfter: string; holderCnpj: string };
}

export function signDpsXml(args: { xml: string; dpsId: string; emitterCnpj: string; material: DpsSigningMaterial; now?: Date }): DpsSignResult {
  let cert: forge.pki.Certificate; let key: forge.pki.rsa.PrivateKey;
  try { cert = forge.pki.certificateFromPem(args.material.certPem); } catch { throw new DpsSignError("CERTIFICATE_MISSING_X509"); }
  try { key = forge.pki.privateKeyFromPem(args.material.keyPem) as forge.pki.rsa.PrivateKey; } catch { throw new DpsSignError("CERTIFICATE_MISSING_KEY"); }
  const pub = cert.publicKey as forge.pki.rsa.PublicKey;
  if (!pub.n || pub.n.compareTo(key.n) !== 0) throw new DpsSignError("CERTIFICATE_KEY_MISMATCH");
  const now = args.now ?? new Date();
  if (cert.validity.notBefore > now) throw new DpsSignError("CERTIFICATE_NOT_YET_VALID");
  if (cert.validity.notAfter < now) throw new DpsSignError("CERTIFICATE_EXPIRED");
  const holder = certificateCnpj(cert);
  const emitter = args.emitterCnpj.replace(/\D/g, "");
  if (!holder || holder !== emitter) throw new DpsSignError("CERTIFICATE_HOLDER_MISMATCH", "A1 não pertence ao CNPJ do prestador (E0718)");
  if (!args.xml.includes(`<infDPS Id="${args.dpsId}">`)) throw new DpsSignError("DPS_SIGN_ID_MISMATCH");
  if (args.xml.includes("<Signature")) throw new DpsSignError("DPS_ALREADY_SIGNED");

  const md = forge.md.sha256.create(); md.update(canonicalizeInfDps(args.xml), "utf8");
  const si = signedInfo(args.dpsId, forge.util.encode64(md.digest().bytes()));
  const smd = forge.md.sha256.create(); smd.update(si, "utf8");
  const sigValue = forge.util.encode64(key.sign(smd));
  const der = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes();
  const fp = forge.md.sha256.create(); fp.update(der);
  const signature = `<Signature xmlns="${DSIG}">${si.replace(` xmlns="${DSIG}"`, "")}<SignatureValue>${sigValue}</SignatureValue>` +
    `<KeyInfo><X509Data><X509Certificate>${forge.util.encode64(der)}</X509Certificate></X509Data></KeyInfo></Signature>`;
  const signedXml = args.xml.replace("</infDPS></DPS>", `</infDPS>${signature}</DPS>`);
  if (signedXml === args.xml) throw new DpsSignError("DPS_SIGN_ANCHOR_MISSING");
  return { signedXml, metadata: { referenceUri: `#${args.dpsId}`, algorithm: "RSA-SHA256",
    certificateFingerprintSha256: forge.util.bytesToHex(fp.digest().bytes()), certificateNotAfter: cert.validity.notAfter.toISOString(), holderCnpj: holder } };
}

/** Verificação cruzada (o harness usa libxml2 C14N + OpenSSL independentes). */
export function verifyDpsSignature(signedXml: string): { valid: boolean; code: string | null } {
  const s = signedXml.lastIndexOf("<Signature "); const e = signedXml.lastIndexOf("</Signature>");
  if (s < 0 || e < 0) return { valid: false, code: "SIGNATURE_ABSENT" };
  const block = signedXml.slice(s, e + 12);
  const si = block.match(/<SignedInfo>[\s\S]*<\/SignedInfo>/)?.[0];
  const uri = block.match(/<Reference URI="#([^"]+)"/)?.[1];
  const dv = block.match(/<DigestValue>([^<]+)</)?.[1];
  const sv = block.match(/<SignatureValue>([^<]+)</)?.[1];
  const cb = block.match(/<X509Certificate>([^<]+)</)?.[1];
  if (!si || !uri || !dv || !sv || !cb) return { valid: false, code: "SIGNATURE_INCOMPLETE" };
  const env = signedXml.slice(0, s) + signedXml.slice(e + 12);
  if (!env.includes(`<infDPS Id="${uri}">`)) return { valid: false, code: "SIGNATURE_REFERENCE_MISMATCH" };
  const md = forge.md.sha256.create(); md.update(canonicalizeInfDps(env), "utf8");
  if (forge.util.encode64(md.digest().bytes()) !== dv) return { valid: false, code: "SIGNATURE_DIGEST_MISMATCH" };
  try {
    const cert = forge.pki.certificateFromAsn1(forge.asn1.fromDer(forge.util.decode64(cb)));
    const smd = forge.md.sha256.create(); smd.update(si.replace("<SignedInfo>", `<SignedInfo xmlns="${DSIG}">`), "utf8");
    const ok = (cert.publicKey as forge.pki.rsa.PublicKey).verify(smd.digest().bytes(), forge.util.decode64(sv));
    return ok ? { valid: true, code: null } : { valid: false, code: "SIGNATURE_VALUE_MISMATCH" };
  } catch { return { valid: false, code: "SIGNATURE_VALUE_MISMATCH" }; }
}
