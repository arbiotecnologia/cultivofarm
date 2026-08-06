import { Link, useNavigate } from "react-router-dom";
import { LogOut, Repeat, Settings, User } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { canAccess } from "@/lib/permissions";
import { getIniciais, getNomeExibicao, getRoleLabel } from "@/lib/portal/identidade";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";

interface UserMenuProps {
  /**
   * Rota de configurações. `undefined` = decide por permissão (`/configuracoes`);
   * `null` = oculta o item.
   */
  settingsTo?: string | null;
  /** Exibe "Trocar de portal" quando o usuário tem mais de um contexto. */
  onSwitchPortal?: () => void;
}

export function UserMenu({ settingsTo, onSwitchPortal }: UserMenuProps = {}) {
  const { profile, user, role, signOut } = useAuth();
  const navigate = useNavigate();

  const nome = (profile as { nome?: string | null } | null)?.nome ?? null;
  const email = (profile as { email?: string | null } | null)?.email ?? user?.email ?? null;
  const iniciais = getIniciais(nome, email);
  const nomeExibicao = getNomeExibicao(nome, email);
  const roleLabel = getRoleLabel(role);

  const settingsPath =
    settingsTo === null
      ? null
      : settingsTo ?? (canAccess(role, "/configuracoes") ? "/configuracoes" : null);

  const handleSignOut = async () => {
    await signOut();
  };


  const avatar = (
    <Avatar className="h-8 w-8 sm:h-9 sm:w-9">
      <AvatarFallback className="bg-primary/10 text-primary text-[11px] sm:text-xs font-semibold">
        {iniciais}
      </AvatarFallback>
    </Avatar>
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="h-auto px-1.5 sm:px-2 py-1.5 flex items-center gap-2 hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`Menu do usuário: ${nomeExibicao}`}
        >
          {avatar}
          <div className="hidden sm:flex flex-col items-start min-w-0 max-w-[140px] md:max-w-[200px] lg:max-w-[260px]">
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="text-xs font-medium leading-tight truncate w-full text-left">
                  {nomeExibicao}
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom" sideOffset={8}>
                <p>{nomeExibicao}</p>
                <p className="text-xs text-muted-foreground">{roleLabel}</p>
              </TooltipContent>
            </Tooltip>
            <span className="text-[10px] leading-tight text-muted-foreground truncate w-full text-left">
              {roleLabel}
            </span>
          </div>
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-64 p-0">
        <div className="px-3 py-3 border-b">
          <div className="flex items-start gap-3">
            <Avatar className="h-10 w-10">
              <AvatarFallback className="bg-primary/10 text-primary text-sm font-semibold">
                {iniciais}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <DropdownMenuLabel className="p-0 text-sm font-semibold leading-tight break-words">
                {nomeExibicao}
              </DropdownMenuLabel>
              <p className="text-xs text-muted-foreground truncate mt-0.5" title={email ?? undefined}>
                {email}
              </p>
              <Badge variant="secondary" className="mt-1.5 text-[10px] px-1.5 py-0 h-5 font-normal">
                {roleLabel}
              </Badge>
            </div>
          </div>
        </div>

        <div className="p-1">
          {settingsPath && (
            <DropdownMenuItem asChild className="cursor-pointer">
              <Link to={settingsPath} className="flex items-center gap-2">
                <Settings className="h-4 w-4 text-muted-foreground" />
                <span>Configurações</span>
              </Link>
            </DropdownMenuItem>
          )}

          {onSwitchPortal && (
            <DropdownMenuItem onClick={onSwitchPortal} className="cursor-pointer">
              <Repeat className="h-4 w-4 mr-2 text-muted-foreground" aria-hidden="true" />
              <span>Trocar de portal</span>
            </DropdownMenuItem>
          )}

          {(settingsPath || onSwitchPortal) && <DropdownMenuSeparator className="my-1" />}


          <DropdownMenuItem
            onClick={handleSignOut}
            className="cursor-pointer text-destructive focus:text-destructive focus:bg-destructive/10"
          >
            <LogOut className="h-4 w-4 mr-2" />
            Sair
          </DropdownMenuItem>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
