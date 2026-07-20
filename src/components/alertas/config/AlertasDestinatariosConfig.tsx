import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Plus, PowerOff } from "lucide-react";
import { toast } from "sonner";
import type { NotificacaoDestinatario } from "@/hooks/useAlertasNotificacoes";

interface Props {
  destinatarios: NotificacaoDestinatario[];
  podeEditar: boolean;
  onSalvar: (input: Partial<NotificacaoDestinatario> & { id?: string }) => Promise<void>;
  onAlternar: (id: string, ativo: boolean) => Promise<void>;
  onRemover: (id: string) => Promise<void>;
}

export function AlertasDestinatariosConfig({
  destinatarios,
  podeEditar,
  onSalvar,
  onAlternar,
  onRemover,
}: Props) {
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);

  const handleAdd = async () => {
    if (!nome.trim() || !email.trim()) {
      toast.error("Nome e e-mail são obrigatórios.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error("E-mail inválido.");
      return;
    }
    setSaving(true);
    try {
      await onSalvar({ nome: nome.trim(), email: email.trim(), canal: "email", ativo: true });
      setNome("");
      setEmail("");
      toast.success("Destinatário adicionado.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao adicionar.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Destinatários</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {podeEditar && (
          <div className="grid gap-2 md:grid-cols-[1fr_1.5fr_auto] md:items-end">
            <div>
              <Label className="text-xs">Nome</Label>
              <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Equipe técnica" />
            </div>
            <div>
              <Label className="text-xs">E-mail</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="equipe@empresa.com.br"
              />
            </div>
            <Button onClick={handleAdd} disabled={saving}>
              <Plus className="h-4 w-4 mr-2" /> Adicionar
            </Button>
          </div>
        )}

        {destinatarios.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum destinatário cadastrado.</p>
        ) : (
          <div className="divide-y rounded-md border">
            {destinatarios.map((d) => (
              <div key={d.id} className="flex items-center justify-between p-3 gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="font-medium text-sm flex items-center gap-2 flex-wrap">
                    {d.nome}
                    <Badge variant="outline" className="text-[10px]">{d.canal}</Badge>
                    {d.receber_resumo && (
                      <Badge variant="secondary" className="text-[10px]">recebe resumo</Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {d.email ?? d.telefone ?? "—"}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1 text-xs text-muted-foreground">
                    Resumo
                    <Switch
                      checked={d.receber_resumo}
                      disabled={!podeEditar}
                      onCheckedChange={(v) =>
                        onSalvar({ id: d.id, receber_resumo: v }).catch(() => toast.error("Erro."))
                      }
                    />
                  </label>
                  <Switch
                    checked={d.ativo}
                    disabled={!podeEditar}
                    onCheckedChange={(v) => onAlternar(d.id, v).catch(() => toast.error("Erro."))}
                  />

                  {podeEditar && d.ativo && (
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Desativar destinatário"
                      onClick={() => {
                        if (confirm(`Desativar destinatário "${d.nome}"? O histórico é preservado.`)) {
                          onRemover(d.id)
                            .then(() => toast.success("Destinatário desativado."))
                            .catch(() => toast.error("Erro ao desativar."));
                        }
                      }}
                    >
                      <PowerOff className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          Destinatários cliente_produtor e financeiro não são permitidos nesta fase. A desativação preserva o histórico de notificações enviadas (sem exclusão destrutiva).
        </p>
      </CardContent>
    </Card>
  );
}
