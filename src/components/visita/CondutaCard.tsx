import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { StickyNote } from "lucide-react";

export interface CondutaState {
  acaoRealizada: string;
  orientacaoCliente: string;
  recomendacaoPreliminar: string;
  necessidadeRetorno: "sim" | "nao" | "avaliar_depois";
  dataSugeridaRetorno: string;
  prioridadeOperacional: "baixa" | "media" | "alta" | "critica";
  observacoesFinais: string;
}

export const CONDUTA_DEFAULT: CondutaState = {
  acaoRealizada: "",
  orientacaoCliente: "",
  recomendacaoPreliminar: "",
  necessidadeRetorno: "avaliar_depois",
  dataSugeridaRetorno: "",
  prioridadeOperacional: "media",
  observacoesFinais: "",
};

interface CondutaCardProps {
  value: CondutaState;
  onChange: (next: CondutaState) => void;
  disabled?: boolean;
}

export function CondutaCard({ value, onChange, disabled }: CondutaCardProps) {
  return (
    <Card className="shadow-sm">
      <CardHeader className="py-2.5 px-4 bg-muted/20">
        <CardTitle className="text-sm flex items-center gap-2">
          <StickyNote className="h-3.5 w-3.5 text-primary" />
          Observações da visita
        </CardTitle>
      </CardHeader>
      <CardContent className="p-3">
        <div className="space-y-1.5">
          <Label htmlFor="conduta-observacoes" className="text-xs sr-only">
            Observações
          </Label>
          <Textarea
            id="conduta-observacoes"
            rows={3}
            value={value.recomendacaoPreliminar}
            onChange={(e) =>
              onChange({ ...value, recomendacaoPreliminar: e.target.value })
            }
            disabled={disabled}
            placeholder="Anotações gerais da visita"
          />
        </div>
      </CardContent>
    </Card>
  );
}
