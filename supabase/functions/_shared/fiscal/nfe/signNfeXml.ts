/**
 * Fase F4 — Assinatura XMLDSig enveloped da NF-e 4.00 (homologação).
 *
 * Regras MOC NF-e 4.00:
 *   - Referência única: URI = "#NFe<chave>" (o Id de `infNFe`).
 *   - Transforms: enveloped-signature seguido de Canonical XML 1.0
 *     (http://www.w3.org/TR/2001/REC-xml-c14n-20010315).
 *   - DigestMethod SHA-1, SignatureMethod RSA-SHA1, KeyInfo com o
 *     X509Certificate do e-CNPJ A1.
 *   - `Signature` é irmã de `infNFe`, dentro de `NFe`.
 *
 * Segurança: a chave privada existe apenas em memória durante a chamada;
 * nunca é logada, retornada nem persistida. O retorno expõe somente
 * metadados públicos (fingerprint, titular, validade).
 *
 * Este módulo usa `npm:node-forge` — executado apenas na Edge Function.
 */
import forge from "npm:node-forge@1";

export interface SignatureMetadata {
  algorithm: string;
  digestAlgorithm: string;
  canonicalization: string;
  referenceUri: string;
  certificateSubject: string;
  certificateIssuer: string;
  certificateSerial: string;
  certificateNotBefore: string;
  certificateNotAfter: string;
  certificateFingerprintSha256: string;
}

export interface SignResult {
  signedXml: string;
  metadata: SignatureMetadata;
}

export class NfeSignError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "NfeSignError";
  }
}

/**
 * Canonicalização C14N 1.0 aplicável ao XML produzido por `buildNfeXml`:
 * o documento já é gerado sem comentários, sem PI, sem CDATA, sem
 * espaçamento entre tags, com atributos em ordem determinística e um único
 * namespace default herdado de `NFe`. Nessas condições, a forma canônica do
 * nó `infNFe` é o próprio recorte textual acrescido da declaração de
 * namespace herdada — implementado explicitamente abaixo.
 */
export function canonicalizeInfNFe(xml: string, namespace: string): string {
  const start = xml.indexOf("<infNFe ");
  const end = xml.indexOf("</infNFe>");
  if (start < 0 || end < 0) {
    throw new NfeSignError("NFE_SIGN_NO_INFNFE", "elemento infNFe não localizado");
  }
  const fragment = xml.slice(start, end + "</infNFe>".length);
  if (fragment.includes("xmlns=")) return fragment;
  return fragment.replace("<infNFe ", `<infNFe xmlns="${namespace}" `);
}

function extractPkcs12(pfx: Uint8Array, password: string) {
  let p12;
  try {
    const asn1 = forge.asn1.fromDer(forge.util.createBuffer(pfx));
    p12 = forge.pkcs12.pkcs12FromAsn1(asn1, false, password);
  } catch {
    throw new NfeSignError("CERTIFICATE_UNREADABLE", "não foi possível abrir o PKCS#12");
  }
  const certBag = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag]?.[0];
  const shrouded = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
  const plain = p12.getBags({ bagType: forge.pki.oids.keyBag });
  const keyBag = shrouded[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0] ?? plain[forge.pki.oids.keyBag]?.[0];
  if (!certBag?.cert) throw new NfeSignError("CERTIFICATE_MISSING_X509", "certificado X.509 ausente");
  if (!keyBag?.key) throw new NfeSignError("CERTIFICATE_MISSING_KEY", "chave privada ausente");
  return { cert: certBag.cert, key: keyBag.key };
}

/** Assina o XML da NF-e (enveloped) e devolve o documento assinado. */
export function signNfeXml(args: {
  xml: string;
  infNFeId: string;
  namespace: string;
  pfx: Uint8Array;
  password: string;
  now?: Date;
}): SignResult {
  const { cert, key } = extractPkcs12(args.pfx, args.password);

  const now = args.now ?? new Date();
  if (cert.validity.notBefore > now) {
    throw new NfeSignError("CERTIFICATE_NOT_YET_VALID", "certificado ainda não é válido");
  }
  if (cert.validity.notAfter < now) {
    throw new NfeSignError("CERTIFICATE_EXPIRED", "certificado expirado");
  }

  const canonical = canonicalizeInfNFe(args.xml, args.namespace);

  const digestMd = forge.md.sha1.create();
  digestMd.update(canonical, "utf8");
  const digestValue = forge.util.encode64(digestMd.digest().bytes());

  const signedInfo =
    `<SignedInfo xmlns="http://www.w3.org/2000/09/xmldsig#">` +
    `<CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"></CanonicalizationMethod>` +
    `<SignatureMethod Algorithm="http://www.w3.org/2000/09/xmldsig#rsa-sha1"></SignatureMethod>` +
    `<Reference URI="#${args.infNFeId}">` +
    `<Transforms>` +
    `<Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"></Transform>` +
    `<Transform Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"></Transform>` +
    `</Transforms>` +
    `<DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"></DigestMethod>` +
    `<DigestValue>${digestValue}</DigestValue>` +
    `</Reference>` +
    `</SignedInfo>`;

  const signMd = forge.md.sha1.create();
  signMd.update(signedInfo, "utf8");
  const signatureValue = forge.util.encode64(
    (key as unknown as { sign: (m: unknown) => string }).sign(signMd),
  );

  const certDer = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes();
  const certB64 = forge.util.encode64(certDer);
  const fpMd = forge.md.sha256.create();
  fpMd.update(certDer);

  const signature =
    `<Signature xmlns="http://www.w3.org/2000/09/xmldsig#">` +
    signedInfo.replace(' xmlns="http://www.w3.org/2000/09/xmldsig#"', "") +
    `<SignatureValue>${signatureValue}</SignatureValue>` +
    `<KeyInfo><X509Data><X509Certificate>${certB64}</X509Certificate></X509Data></KeyInfo>` +
    `</Signature>`;

  const signedXml = args.xml.replace("</NFe>", `${signature}</NFe>`);
  if (signedXml === args.xml) {
    throw new NfeSignError("NFE_SIGN_ANCHOR_MISSING", "não foi possível ancorar a assinatura em </NFe>");
  }

  const attrValue = (attrs: Array<{ shortName?: string; name?: string; value?: string }>, key: string) =>
    attrs.find((a) => a.shortName === key || a.name === key)?.value ?? "";

  return {
    signedXml,
    metadata: {
      algorithm: "RSA-SHA1",
      digestAlgorithm: "SHA-1",
      canonicalization: "http://www.w3.org/TR/2001/REC-xml-c14n-20010315",
      referenceUri: `#${args.infNFeId}`,
      certificateSubject: attrValue(cert.subject.attributes, "CN"),
      certificateIssuer: attrValue(cert.issuer.attributes, "CN"),
      certificateSerial: String(cert.serialNumber ?? ""),
      certificateNotBefore: cert.validity.notBefore.toISOString(),
      certificateNotAfter: cert.validity.notAfter.toISOString(),
      certificateFingerprintSha256: forge.util.bytesToHex(fpMd.digest().bytes()),
    },
  };
}
