/**
 * Identificação do usuário logado no Portal Parceiro B2B.
 * Apenas apresentação — não altera guards, rotas ou permissões.
 */
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

export type PortalParceiroPapelVisual = "gestor" | "tecnico" | "staff";

export function getIniciais(nome?: string | null, email?: string | null): string {
  const base = (nome || "").trim();
  if (base) {
    const partes = base.split(/\s+/).filter(Boolean);
    const primeira = partes[0]?.[0] ?? "";
    const ultima = partes.length > 1 ? partes[partes.length - 1][0] : "";
    return (primeira + ultima).toUpperCase();
  }
  return (email?.[0] ?? "?").toUpperCase();
}

export function getPrimeiroNome(nome?: string | null, email?: string | null): string {
  const base = (nome || "").trim();
  if (base) return base.split(/\s+/)[0];
  if (email) return email.split("@")[0];
  return "Usuário";
}

export function getPapelLabel(papel: PortalParceiroPapelVisual): string {
  if (papel === "staff") return "Visão interna";
  if (papel === "tecnico") return "Técnico B2B";
  return "Gestor B2B";
}

interface Props {
  papel: PortalParceiroPapelVisual;
  variant?: "sidebar" | "compact";
  className?: string;
}

export function UsuarioIdentidade({ papel, variant = "sidebar", className }: Props) {
  const { profile, user } = useAuth();
  const nome = profile?.nome ?? null;
  const email = profile?.email ?? user?.email ?? null;
  const iniciais = getIniciais(nome, email);
  const papelLabel = getPapelLabel(papel);

  if (variant === "compact") {
    return (
      <div className={cn("flex items-center gap-2 min-w-0", className)}>
        <span
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary"
          aria-hidden="true"
        >
          {iniciais}
        </span>
        <div className="flex flex-col min-w-0">
          <span className="text-xs font-medium leading-tight truncate max-w-[110px]">
            {getPrimeiroNome(nome, email)}
          </span>
          <span className="text-[10px] leading-tight text-muted-foreground truncate">
            {papelLabel}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("px-4 py-3 border-b", className)}>
      <div className="flex items-center gap-3 min-w-0">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary"
          aria-hidden="true"
        >
          {iniciais}
        </span>
        <div className="min-w-0">
          <div className="text-sm font-medium leading-tight truncate">
            {nome || email || "Usuário"}
          </div>
          {email && (
            <div className="text-[11px] leading-tight text-muted-foreground truncate">
              {email}
            </div>
          )}
        </div>
      </div>
      <span
        className="mt-2 inline-flex w-fit items-center rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary"
        aria-label={`Papel no portal: ${papelLabel}`}
      >
        {papelLabel}
      </span>
    </div>
  );
}
