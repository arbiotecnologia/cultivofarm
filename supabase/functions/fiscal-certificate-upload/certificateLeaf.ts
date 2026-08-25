/**
 * H7D.1 — seleção segura do certificado folha em PKCS#12.
 *
 * Um arquivo A1 pode trazer a cadeia em ordem variável. Portanto, o certificado
 * folha não pode ser assumido como o primeiro `certBag`: ele deve ser o único
 * certificado cuja publicKey verifica uma assinatura feita pela private key
 * extraída do mesmo PKCS#12.
 */

export type CertificateLeafSelectionStatus = "selected" | "missing" | "no_match" | "ambiguous";

interface DigestLike {
  update(input: string): void;
  digest(): { bytes(): string };
}

interface PublicKeyLike {
  verify(digestBytes: string, signature: string): boolean;
}

interface PrivateKeyLike {
  sign(digest: DigestLike): string;
}

interface CertificateLike {
  publicKey?: PublicKeyLike;
}

interface CertBagLike {
  cert?: CertificateLike | null;
}

export interface CertificateLeafSelection<TCert extends CertificateLike> {
  status: CertificateLeafSelectionStatus;
  leaf: TCert | null;
  leafIndex: number;
  chain: TCert[];
}

export function selectCertificateLeafForPrivateKey<TCert extends CertificateLike>(args: {
  certBags: Array<CertBagLike | null | undefined>;
  privateKey: PrivateKeyLike;
  createSha256Digest: () => DigestLike;
  createNonce: () => string;
}): CertificateLeafSelection<TCert> {
  const certs = args.certBags
    .map((bag, index) => ({ cert: bag?.cert as TCert | null | undefined, index }))
    .filter((item): item is { cert: TCert; index: number } => !!item.cert?.publicKey);

  if (certs.length === 0) {
    return { status: "missing", leaf: null, leafIndex: -1, chain: [] };
  }

  const challenge = args.createNonce();
  const signerDigest = args.createSha256Digest();
  signerDigest.update(challenge);
  const signature = args.privateKey.sign(signerDigest);

  const matches = certs.filter(({ cert }) => {
    try {
      const verifierDigest = args.createSha256Digest();
      verifierDigest.update(challenge);
      return cert.publicKey?.verify(verifierDigest.digest().bytes(), signature) === true;
    } catch {
      return false;
    }
  });

  if (matches.length === 0) {
    return { status: "no_match", leaf: null, leafIndex: -1, chain: certs.map((item) => item.cert) };
  }
  if (matches.length > 1) {
    return { status: "ambiguous", leaf: null, leafIndex: -1, chain: certs.map((item) => item.cert) };
  }

  const match = matches[0];
  return {
    status: "selected",
    leaf: match.cert,
    leafIndex: match.index,
    chain: certs.filter((item) => item.index !== match.index).map((item) => item.cert),
  };
}