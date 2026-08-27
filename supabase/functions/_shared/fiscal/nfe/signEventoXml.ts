/**
 * FASE H7g — Assinatura XMLDSig do evento NF-e (cancelamento / CC-e).
 *
 * Isolado de `buildEventoXml.ts` porque usa `npm:node-forge`, disponível apenas
 * no runtime da Edge Function. O material do A1 trafega somente em memória.
 */
import forge from "npm:node-forge@1";
import {
  canonicalizeInfEvento,
  FiscalEventXmlError,
} from "./buildEventoXml.ts";

export interface EventSigningMaterial {
  certPem: string;
  keyPem: string;
}

/** Assinatura XMLDSig enveloped do evento (mesma política da NF-e). */
export function signEventoXml(args: {
  xml: string;
  infEventoId: string;
  material: EventSigningMaterial;
  now?: Date;
}): string {
  let cert;
  let key;
  try {
    cert = forge.pki.certificateFromPem(args.material.certPem);
  } catch {
    throw new FiscalEventXmlError("CERTIFICATE_MISSING_X509");
  }
  try {
    key = forge.pki.privateKeyFromPem(args.material.keyPem);
  } catch {
    throw new FiscalEventXmlError("CERTIFICATE_MISSING_KEY");
  }

  const now = args.now ?? new Date();
  if (cert.validity.notBefore > now) throw new FiscalEventXmlError("CERTIFICATE_NOT_YET_VALID");
  if (cert.validity.notAfter < now) throw new FiscalEventXmlError("CERTIFICATE_EXPIRED");

  const canonical = canonicalizeInfEvento(args.xml);
  const digestMd = forge.md.sha1.create();
  digestMd.update(canonical, "utf8");
  const digestValue = forge.util.encode64(digestMd.digest().bytes());

  const signedInfo =
    `<SignedInfo xmlns="http://www.w3.org/2000/09/xmldsig#">` +
    `<CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"></CanonicalizationMethod>` +
    `<SignatureMethod Algorithm="http://www.w3.org/2000/09/xmldsig#rsa-sha1"></SignatureMethod>` +
    `<Reference URI="#${args.infEventoId}">` +
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

  const signature =
    `<Signature xmlns="http://www.w3.org/2000/09/xmldsig#">` +
    signedInfo.replace(' xmlns="http://www.w3.org/2000/09/xmldsig#"', "") +
    `<SignatureValue>${signatureValue}</SignatureValue>` +
    `<KeyInfo><X509Data><X509Certificate>${forge.util.encode64(certDer)}` +
    `</X509Certificate></X509Data></KeyInfo>` +
    `</Signature>`;

  const signed = args.xml.replace("</evento>", `${signature}</evento>`);
  if (signed === args.xml) throw new FiscalEventXmlError("FISCAL_EVENT_SIGN_ANCHOR_MISSING");
  return signed;
}
