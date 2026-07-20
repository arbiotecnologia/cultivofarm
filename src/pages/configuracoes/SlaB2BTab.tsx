import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Timer, Save } from "lucide-react";
import { useB2BSlaConfig, useUpdateSlaConfig, validateSlaPrazo, SLA_MIN_HORAS, SLA_MAX_HORAS, type SlaConfigRow } from "@/hooks/useB2BSlaConfig";
import { FASE_LABEL } from "@/lib/b2bSla";
import { toast } from "sonner";

export function SlaB2BTab({ podeEditar }: { podeEditar: boolean }) {
  const { data = [], isLoading } = useB2BSlaConfig();
  const update = useUpdateSlaConfig();
  const [draft, setDraft] = useState<Record<string, number>>({});

  useEffect(() => {
    const d: Record<string, number> = {};
    for (const r of data) d[r.id] = r.prazo_horas;
    setDraft(d);
  }, [data]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Timer className="h-5 w-5" /> SLA de Pedidos B2B
        </CardTitle>
        <CardDescription>
          Prazos máximos por fase do pedido. Quando uma fase ultrapassa o limite, um alerta é gerado
          automaticamente na Central de Alertas (verificação a cada 30 minutos).
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fase</TableHead>
                <TableHead className="w-40">Prazo (horas)</TableHead>
                <TableHead className="w-28">Ativo</TableHead>
                <TableHead className="w-32"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((r: SlaConfigRow) => {
                const valor = draft[r.id] ?? r.prazo_horas;
                const dirty = valor !== r.prazo_horas;
                return (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{FASE_LABEL[r.fase]}</TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={SLA_MIN_HORAS}
                        max={SLA_MAX_HORAS}
                        step={1}
                        value={valor}
                        disabled={!podeEditar}
                        onChange={(e) => setDraft((d) => ({ ...d, [r.id]: Number(e.target.value) }))}
                      />
                      {dirty && validateSlaPrazo(valor).ok === false && (
                        <p className="text-xs text-destructive mt-1">
                          {(validateSlaPrazo(valor) as { ok: false; error: string }).error}
                        </p>
                      )}
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={r.ativo}
                        disabled={!podeEditar || update.isPending}
                        onCheckedChange={(v) => update.mutate({ id: r.id, ativo: v })}
                      />
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant={dirty ? "default" : "outline"}
                        disabled={!podeEditar || !dirty || update.isPending || validateSlaPrazo(valor).ok === false}
                        onClick={() => {
                          const r2 = validateSlaPrazo(valor);
                          if (r2.ok === false) { toast.error(r2.error); return; }
                          update.mutate({ id: r.id, prazo_horas: r2.value });
                        }}
                      >
                        <Save className="h-3.5 w-3.5 mr-1" /> Salvar
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
        {!podeEditar && (
          <p className="text-xs text-muted-foreground mt-3">
            Apenas administrador e gestor podem alterar os prazos.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
