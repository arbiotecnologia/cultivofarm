import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { toast } from "sonner";
import { CalendarClock } from "lucide-react";
import type { NotificacaoConfig } from "@/hooks/useAlertasNotificacoes";

interface Props {
  config: NotificacaoConfig | undefined;
  podeEditar: boolean;
  onSalvar: (id: string, patch: Partial<NotificacaoConfig>) => Promise<void>;
}

const DIAS = [
  { v: 1, l: "Seg" }, { v: 2, l: "Ter" }, { v: 3, l: "Qua" },
  { v: 4, l: "Qui" }, { v: 5, l: "Sex" }, { v: 6, l: "Sáb" }, { v: 0, l: "Dom" },
];

export function AlertasResumoConfig({ config, podeEditar, onSalvar }: Props) {
  const [saving, setSaving] = useState(false);

  if (!config) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          Configuração de e-mail não encontrada.
        </CardContent>
      </Card>
    );
  }

  const save = async (patch: Partial<NotificacaoConfig>) => {
    setSaving(true);
    try {
      await onSalvar(config.id, patch);
      toast.success("Configuração de resumo atualizada.");
    } catch {
      toast.error("Não foi possível salvar.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <CalendarClock className="h-4 w-4" />
          Resumos executivos
          <Badge variant="outline" className="ml-2 text-[10px]">e-mail</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <Label className="text-sm">Resumo diário</Label>
              <p className="text-xs text-muted-foreground">Consolidado das últimas 24h.</p>
            </div>
            <Switch
              checked={config.resumo_diario_ativo}
              disabled={!podeEditar || saving}
              onCheckedChange={(v) => save({ resumo_diario_ativo: v })}
            />
          </div>
          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <Label className="text-sm">Resumo semanal</Label>
              <p className="text-xs text-muted-foreground">Consolidado dos últimos 7 dias.</p>
            </div>
            <Switch
              checked={config.resumo_semanal_ativo}
              disabled={!podeEditar || saving}
              onCheckedChange={(v) => save({ resumo_semanal_ativo: v })}
            />
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <Label className="text-xs">Horário do resumo</Label>
            <Input
              type="time"
              defaultValue={config.horario_resumo ?? "07:00"}
              disabled={!podeEditar || saving}
              onBlur={(e) => {
                const v = e.target.value || null;
                if (v !== config.horario_resumo) save({ horario_resumo: v });
              }}
            />
          </div>
          <div className="md:col-span-2">
            <Label className="text-xs">Dia da semana (semanal)</Label>
            <div className="flex flex-wrap gap-1 mt-1">
              {DIAS.map((d) => {
                const ativo = config.dia_semana_resumo === d.v;
                return (
                  <button
                    key={d.v}
                    type="button"
                    disabled={!podeEditar || saving}
                    onClick={() => save({ dia_semana_resumo: d.v })}
                    className={`px-3 py-1.5 rounded-md text-xs border transition ${
                      ativo
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background hover:bg-muted"
                    }`}
                  >
                    {d.l}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <label className="flex items-center justify-between rounded-md border p-3">
            <span className="text-sm">Incluir gravidade média</span>
            <Switch
              checked={config.incluir_alertas_media}
              disabled={!podeEditar || saving}
              onCheckedChange={(v) => save({ incluir_alertas_media: v })}
            />
          </label>
          <label className="flex items-center justify-between rounded-md border p-3">
            <span className="text-sm">Incluir informativos</span>
            <Switch
              checked={config.incluir_informativos}
              disabled={!podeEditar || saving}
              onCheckedChange={(v) => save({ incluir_informativos: v })}
            />
          </label>
        </div>

        <p className="text-xs text-muted-foreground">
          WhatsApp será ativado em fase futura com templates aprovados. Resumos não são enviados para cliente/produtor ou financeiro nesta fase.
        </p>
      </CardContent>
    </Card>
  );
}
