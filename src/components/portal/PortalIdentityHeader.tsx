/**
 * Cabeçalho de identidade padronizado para todos os portais.
 *
 * Hierarquia fixa:
 *   1. marca do portal (uma linha)
 *   2. contexto ativo (parceiro / cliente / organização) ou seletor de contexto
 *   3. usuário (avatar de iniciais) + papel como texto secundário + e-mail
 *
 * Apenas apresentação — não altera guards, rotas, permissões ou dados.
 */
import type { ComponentType, ReactNode, SVGProps } from "react";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { getIniciais, getNomeExibicao } from "@/lib/portal/identidade";

interface PortalIdentityHeaderProps {
  /** Nome do portal, ex.: "Portal Parceiro". Omitido na variante compact quando desnecessário. */
  brandTitle?: string;
  /** Ícone da marca do portal. */
  brandIcon?: ComponentType<SVGProps<SVGSVGElement>>;
  /** Texto do contexto ativo (parceiro, cliente, origem). */
  contextLabel?: string | null;
  /** Substitui a linha de contexto por um seletor (Select/Popover). */
  contextSlot?: ReactNode;
  /** Rótulo do papel do usuário, já resolvido pelo chamador. */
  roleLabel?: string | null;
  variant?: "sidebar" | "compact";
  /** Exibe o e-mail (padrão: só na variante sidebar). */
  showEmail?: boolean;
  className?: string;
}

export function PortalIdentityHeader({
  brandTitle,
  brandIcon: BrandIcon,
  contextLabel,
  contextSlot,
  roleLabel,
  variant = "sidebar",
  showEmail,
  className,
}: PortalIdentityHeaderProps) {
  const { profile, user } = useAuth();
  const nome = (profile as { nome?: string | null } | null)?.nome ?? null;
  const email = (profile as { email?: string | null } | null)?.email ?? user?.email ?? null;
  const iniciais = getIniciais(nome, email);
  const nomeExibicao = getNomeExibicao(nome, email);

  const avatar = (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary",
        variant === "compact" ? "h-8 w-8 text-[11px]" : "h-9 w-9 text-xs",
      )}
      aria-hidden="true"
    >
      {iniciais}
    </span>
  );

  if (variant === "compact") {
    return (
      <div className={cn("flex items-center gap-2 min-w-0", className)}>
        {avatar}
        <div className="flex flex-col min-w-0">
          <span className="text-xs font-medium leading-tight truncate max-w-[160px]" title={nomeExibicao}>
            {nomeExibicao}
            {roleLabel ? (
              <span className="text-muted-foreground font-normal" aria-label={`Papel: ${roleLabel}`}>
                {" · "}
                {roleLabel}
              </span>
            ) : null}
          </span>
          {(contextLabel || showEmail) && (
            <span
              className="text-[10px] leading-tight text-muted-foreground truncate max-w-[160px]"
              title={contextLabel ?? email ?? undefined}
            >
              {contextLabel ?? email}
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={cn("border-b", className)}>
      {(brandTitle || contextSlot || contextLabel) && (
        <div className="px-4 pt-4 pb-3 space-y-2">
          {brandTitle && (
            <div className="flex items-center gap-2 min-w-0">
              {BrandIcon && <BrandIcon className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />}
              <span className="text-sm font-semibold leading-tight truncate">{brandTitle}</span>
            </div>
          )}
          {contextSlot ? (
            <div className="space-y-1">{contextSlot}</div>
          ) : contextLabel ? (
            <p
              className="text-sm font-medium leading-snug line-clamp-2 break-words"
              title={contextLabel}
            >
              {contextLabel}
            </p>
          ) : null}
        </div>
      )}

      <div className="flex items-center gap-3 min-w-0 px-4 pb-3">
        {avatar}
        <div className="min-w-0">
          <div className="text-sm font-medium leading-tight truncate" title={nomeExibicao}>
            {nomeExibicao}
            {roleLabel ? (
              <span
                className="text-muted-foreground font-normal"
                aria-label={`Papel no portal: ${roleLabel}`}
              >
                {" · "}
                {roleLabel}
              </span>
            ) : null}
          </div>
          {(showEmail ?? true) && email && (
            <div className="text-[11px] leading-tight text-muted-foreground truncate" title={email}>
              {email}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
