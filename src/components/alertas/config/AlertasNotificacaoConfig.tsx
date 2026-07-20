import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Mail, MessageCircle } from "lucide-react";
import type { NotificacaoConfig } from "@/hooks/useAlertasNotificacoes";

interface Props {
  configs: NotificacaoConfig[];
  podeEditar: boolean;
  onSalvar: (id: string, patch: Partial<NotificacaoConfig>) => Promise<void>;
}

export function AlertasNotificacaoConfig({ configs, podeEditar, onSalvar }: Props) {
  const [savingId, setSavingId] = useState<string | null>(null);

  const handleSave = async (id: string, patch: Partial<NotificacaoConfig>) => {
    setSavingId(id);
    try {
      await onSalvar(id, patch);
      toast.success("Configuração atualizada.");
    } catch {
      toast.error("Não foi possível salvar a configuração.");
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {configs.map((cfg) => {
        const isWa = cfg.canal === "whatsapp";
        return (
          <Card key={cfg.id}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                {isWa ? <MessageCircle className="h-4 w-4" /> : <Mail className="h-4 w-4" />}
                Canal {isWa ? "WhatsApp" : "E-mail"}
                {isWa && (
                  <Badge variant="outline" className="ml-2 text-xs">
                    Preparado para fase futura
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Label className="text-sm">Ativo</Label>
                <Switch
                  checked={cfg.ativo}
                  disabled={!podeEditar || isWa || savingId === cfg.id}
                  onCheckedChange={(v) => handleSave(cfg.id, { ativo: v })}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Cooldown (min)</Label>
                  <Input
                    type="number"
                    min={1}
                    defaultValue={cfg.cooldown_minutos}
                    disabled={!podeEditar || savingId === cfg.id}
                    onBlur={(e) => {
                      const v = Number(e.target.value);
                      if (v && v !== cfg.cooldown_minutos) handleSave(cfg.id, { cooldown_minutos: v });
                    }}
                  />
                </div>
                <div>
                  <Label className="text-xs">Máx. envios/alerta</Label>
                  <Input
                    type="number"
                    min={1}
                    defaultValue={cfg.max_envios_por_alerta}
                    disabled={!podeEditar || savingId === cfg.id}
                    onBlur={(e) => {
                      const v = Number(e.target.value);
                      if (v && v !== cfg.max_envios_por_alerta)
                        handleSave(cfg.id, { max_envios_por_alerta: v });
                    }}
                  />
                </div>
              </div>

              <div>
                <Label className="text-xs">Gravidades</Label>
                <div className="flex flex-wrap gap-1 mt-1">
                  {(["critica", "alta"] as const).map((g) => {
                    const ativa = cfg.gravidades.includes(g);
                    return (
                      <Button
                        key={g}
                        size="sm"
                        variant={ativa ? "default" : "outline"}
                        disabled={!podeEditar || savingId === cfg.id}
                        onClick={() => {
                          const nova = ativa
                            ? cfg.gravidades.filter((x) => x !== g)
                            : [...cfg.gravidades, g];
                          if (nova.length === 0) {
                            toast.error("Pelo menos uma gravidade é obrigatória.");
                            return;
                          }
                          handleSave(cfg.id, { gravidades: nova });
                        }}
                      >
                        {g}
                      </Button>
                    );
                  })}
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Apenas alertas críticos/alta geram notificação externa nesta fase.
                </p>
              </div>

              {isWa && (
                <p className="text-xs text-muted-foreground">
                  WhatsApp será ativado em fase futura via Meta Cloud API com templates aprovados e opt-in.
                </p>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
