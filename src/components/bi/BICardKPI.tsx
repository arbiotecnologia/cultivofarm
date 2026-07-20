import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Info, TrendingUp, TrendingDown } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface BICardKPIProps {
  titulo: string;
  valor?: string | number | null;
  descricao?: string;
  loading?: boolean;
  empty?: boolean;
  tooltip?: string;
  sufixo?: string;
  icone?: React.ElementType;
  className?: string;
  variant?: "default" | "warning" | "error" | "success";
}

export function BICardKPI({
  titulo,
  valor,
  descricao,
  loading,
  empty,
  tooltip,
  sufixo,
  icone: Icone,
  className,
  variant = "default"
}: BICardKPIProps) {
  if (loading) {
    return (
      <Card className={cn("overflow-hidden", className)}>
        <CardHeader className="p-4 pb-0">
          <Skeleton className="h-4 w-2/3" />
        </CardHeader>
        <CardContent className="p-4">
          <Skeleton className="h-8 w-1/2 mb-2" />
          <Skeleton className="h-3 w-full" />
        </CardContent>
      </Card>
    );
  }

  const isNoData = empty || valor === null || valor === undefined || valor === "" || valor === "Sem dados" || (typeof valor === "string" && (valor.trim() === "" || valor.includes("Sem dados suficientes") || valor === "NaN"));

  return (
    <Card className={cn("overflow-hidden transition-all hover:shadow-md border-l-4", 
      variant === "default" && "border-l-primary",
      variant === "warning" && "border-l-yellow-500",
      variant === "error" && "border-l-red-500",
      variant === "success" && "border-l-green-500",
      className
    )}>
      <CardHeader className="p-4 pb-0 flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          {Icone && <Icone className="h-3.5 w-3.5 text-primary" />}
          {titulo}
          {tooltip && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent>
                  <p className="max-w-xs text-xs">{tooltip}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4">
        <div className="flex items-baseline gap-1">
          <span className={cn("text-2xl font-black tracking-tight", isNoData && "text-sm italic font-normal text-muted-foreground")}>
            {isNoData ? "Sem dados suficientes" : valor}
          </span>
          {!isNoData && sufixo && (
            <span className="text-sm font-medium text-muted-foreground">{sufixo}</span>
          )}
        </div>
        {descricao && (
          <p className="text-[11px] text-muted-foreground mt-1 leading-tight line-clamp-2">
            {descricao}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
