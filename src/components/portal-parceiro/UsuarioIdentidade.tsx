/**
 * Wrapper fino sobre PortalIdentityHeader, preservado para compatibilidade de
 * imports existentes no Portal Parceiro. Apenas apresentação.
 */
import { PortalIdentityHeader } from "@/components/portal/PortalIdentityHeader";
import {
  getIniciais,
  getPrimeiroNome,
  getPapelLabel,
  type PortalParceiroPapelVisual,
} from "@/lib/portal/identidade";

export { getIniciais, getPrimeiroNome, getPapelLabel };
export type { PortalParceiroPapelVisual };

interface Props {
  papel: PortalParceiroPapelVisual;
  variant?: "sidebar" | "compact";
  className?: string;
}

export function UsuarioIdentidade({ papel, variant = "sidebar", className }: Props) {
  return (
    <PortalIdentityHeader
      variant={variant}
      roleLabel={getPapelLabel(papel)}
      className={className}
    />
  );
}
