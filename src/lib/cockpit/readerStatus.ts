/** Presentation from the canonical list RPC only; never authorizes an operation. */
export function cockpitReaderStatus(statusOS: string | null | undefined, statusEsteira: string | null | undefined): string | null {
  if (statusOS === 'aberta' || statusOS === 'aprovada') return statusOS;
  return statusEsteira || null;
}