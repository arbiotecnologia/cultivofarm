/**
 * PortalTopBar — barra superior única de todos os portais.
 *
 * Zonas fixas:
 *   [ gatilho de menu + marca ]  [ contexto ativo ]  [ notificações + menu do usuário ]
 *
 * Apenas apresentação: não altera guards, rotas, permissões ou dados.
 */
import type { ComponentType, ReactNode, SVGProps } from "react";
import { cn } from "@/lib/utils";
import { CentralNotificacoesHeader } from "@/components/notificacoes/CentralNotificacoesHeader";
import { UserMenu } from "@/components/UserMenu";

interface PortalTopBarProps {
  /** Nome do portal exibido à esquerda. */
  brandTitle: string;
  /** Linha secundária da marca (opcional). */
  brandSubtitle?: string;
  brandIcon?: ComponentType<SVGProps<SVGSVGElement>>;
  /** Logomarca do contexto (cliente/parceiro); substitui o ícone quando informada. */
  brandLogoUrl?: string | null;
  /** Botão de menu (SidebarTrigger, hambúrguer, etc.). */
  leadingSlot?: ReactNode;
  /** Seletor de contexto ativo (cliente, parceiro...). */
  contextSlot?: ReactNode;
  /** Oculta a marca em telas pequenas (usado onde o menu lateral já a exibe). */
  hideBrandOnMobile?: boolean;
  showNotifications?: boolean;
  /** Rota de configurações no menu do usuário; null oculta o item. */
  settingsTo?: string | null;
  onSwitchPortal?: () => void;
  className?: string;
}

export function PortalTopBar({
  brandTitle,
  brandSubtitle,
  brandIcon: BrandIcon,
  brandLogoUrl,
  leadingSlot,
  contextSlot,
  hideBrandOnMobile,
  showNotifications = true,
  settingsTo,
  onSwitchPortal,
  className,
}: PortalTopBarProps) {
  return (
    <header
      className={cn(
        "sticky top-0 z-30 h-14 sm:h-16 flex items-center justify-between gap-2 border-b bg-card/95 px-2 sm:px-4",
        "backdrop-blur supports-[backdrop-filter]:bg-card/80",
        className,
      )}
    >
      <div className="flex items-center gap-2 min-w-0">
        {leadingSlot}
        <div className={cn("flex items-center gap-2 min-w-0", hideBrandOnMobile && "hidden sm:flex")}>
          {brandLogoUrl ? (
            <img
              src={brandLogoUrl}
              alt={brandTitle}
              className="h-7 w-auto max-w-[120px] shrink-0 object-contain"
            />
          ) : (
            BrandIcon && <BrandIcon className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
          )}
          <div className="flex flex-col min-w-0">
            <span className="text-sm font-semibold leading-tight truncate">{brandTitle}</span>
            {brandSubtitle && (
              <span className="text-[10px] leading-tight text-muted-foreground truncate">
                {brandSubtitle}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1 sm:gap-3 min-w-0">
        {contextSlot}
        {showNotifications && <CentralNotificacoesHeader />}
        <UserMenu settingsTo={settingsTo} onSwitchPortal={onSwitchPortal} />
      </div>
    </header>
  );
}
