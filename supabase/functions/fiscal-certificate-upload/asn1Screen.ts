/**
 * Fase H7c — Triagem ASN.1 mínima para PKCS#12.
 *
 * Motivo: a triagem anterior assumia que todo PFX começa com `30 82`
 * (DER, comprimento longo de 2 bytes). Certificados A1 emitidos com
 * codificação BER de comprimento indefinido começam com `30 80` e eram
 * rejeitados antes mesmo do parser, retornando `not_pkcs12`.
 *
 * Esta função faz APENAS a triagem barata de "isto pode ser um SEQUENCE
 * ASN.1 (BER/DER)". A autoridade real de formato continua sendo
 * `forge.asn1.fromDer` + `forge.pkcs12.pkcs12FromAsn1`, que validam a
 * estrutura PKCS#12, a senha, o certificado e a chave privada.
 *
 * Não recebe, não guarda e não registra senha nem material sensível.
 */

/** Tamanho mínimo plausível para um PKCS#12 real (bem abaixo do menor A1). */
export const MIN_PKCS12_BYTES = 64;

const ASN1_SEQUENCE_TAG = 0x30;
const BER_INDEFINITE_LENGTH = 0x80;
const MAX_LONG_FORM_BYTES = 0x84; // até 4 bytes de comprimento

/**
 * Retorna true quando o buffer começa com um SEQUENCE ASN.1 cuja forma de
 * comprimento é válida em BER ou DER:
 *   - forma curta   : 0x00–0x7f
 *   - forma indefinida (BER): 0x80
 *   - forma longa   : 0x81–0x84 (1 a 4 bytes de comprimento)
 * Qualquer outra coisa é rejeitada de imediato (fail-closed).
 */
export function isPlausibleAsn1Sequence(bytes: Uint8Array): boolean {
  if (bytes.length < MIN_PKCS12_BYTES) return false;
  if (bytes[0] !== ASN1_SEQUENCE_TAG) return false;

  const lengthByte = bytes[1];

  // Forma curta: o conteúdo declarado precisa caber no buffer.
  if (lengthByte <= 0x7f) return 2 + lengthByte <= bytes.length;

  // Forma indefinida (BER): exige terminador EOC (00 00) no fim do buffer.
  if (lengthByte === BER_INDEFINITE_LENGTH) {
    const n = bytes.length;
    return bytes[n - 2] === 0x00 && bytes[n - 1] === 0x00;
  }

  // Forma longa: 0x81–0x84 e os bytes de comprimento precisam existir.
  if (lengthByte > BER_INDEFINITE_LENGTH && lengthByte <= MAX_LONG_FORM_BYTES) {
    const lenBytes = lengthByte & 0x7f;
    if (bytes.length < 2 + lenBytes) return false;
    let declared = 0;
    for (let i = 0; i < lenBytes; i++) declared = declared * 256 + bytes[2 + i];
    // Truncamento evidente é rejeitado; excesso fica a cargo do parser.
    return declared > 0 && 2 + lenBytes + declared <= bytes.length;
  }

  return false;
}
