import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface Acao {
  categoria: string;
  acao: string;
  motivo: string;
  prioridade: string;
  responsavel_sugerido?: string;
  cliente?: string;
  fazenda?: string;
  rota_origem?: string;
  impacto?: string;
}

interface Props {
  acoes: Acao[];
  isLoading?: boolean;
}

const prioBadge = (p: string) => p === "critica" ? "destructive" : p === "alta" ? "default" : "secondary";

export function ExecutivoPlanoAcao({ acoes, isLoading }: Props) {
  const nav = useNavigate();

  if (isLoading) {
    return (
      <Card className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-24 bg-muted rounded animate-pulse" />)}
        </div>
      </Card>
    );
  }

  if (!acoes.length) {
    return <Card className="p-6 text-center text-sm text-muted-foreground">Sem ações recomendadas no momento.</Card>;
  }

  return (
    <Card className="p-3 md:p-4">
      <h3 className="text-sm font-semibold mb-3">Plano de ação recomendado</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {acoes.map((a, i) => (
          <div key={i} className="border rounded-md p-3 hover:bg-muted/40 transition">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold">{a.acao}</span>
              <Badge variant={prioBadge(a.prioridade) as any} className="text-[10px]">{a.prioridade}</Badge>
            </div>
            <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2">{a.motivo}</p>
            {a.impacto && <p className="text-[10px] text-emerald-600 mt-1">💡 {a.impacto}</p>}
            <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-2 text-[10px] text-muted-foreground">
              {a.responsavel_sugerido && <span>👨‍💼 {a.responsavel_sugerido}</span>}
              {a.cliente && <span>👤 {a.cliente}</span>}
              {a.fazenda && <span>🌾 {a.fazenda}</span>}
            </div>
            {a.rota_origem && (
              <Button size="sm" variant="outline" className="h-7 mt-2 text-xs" onClick={() => nav(a.rota_origem!)}>
                Abrir módulo <ArrowRight className="h-3 w-3 ml-1" />
              </Button>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}
