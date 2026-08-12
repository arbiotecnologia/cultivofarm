import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { UserCheck, CalendarClock } from "lucide-react";
import { format } from "date-fns";
import { formatDateTimeDisplay } from "@/lib/date-utils";

interface Props {
  solicitacao: any;
  onChanged?: () => void;
}

const URGENCIAS = [
  { value: "baixa", label: "Baixa" },
  { value: "media", label: "Média" },
  { value: "alta", label: "Alta" },
  { value: "critica", label: "Crítica" },
];

export function AtribuicaoForm({ solicitacao, onChanged }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();

  const [consultorId, setConsultorId] = useState<string>(solicitacao.consultor_atribuido || "");
  const [dataPrevista, setDataPrevista] = useState<string>(
    solicitacao.data_prevista_atendimento
      ? format(new Date(solicitacao.data_prevista_atendimento), "yyyy-MM-dd'T'HH:mm")
      : ""
  );
  const [urgencia, setUrgencia] = useState<string>(solicitacao.urgencia || "media");
  const [observacoes, setObservacoes] = useState("");
  const [duracao, setDuracao] = useState<string>(solicitacao.duracao_estimada?.toString() || "120");

  const { data: consultores } = useQuery({
    queryKey: ["consultores-disponiveis"],
    queryFn: async () => {
      const { data: roles } = await (supabase as any)
        .from("user_roles")
        .select("user_id")
        .in("role", ["consultor_tecnico", "tecnico_agronomo"]);
      const userIds = (roles || []).map((r) => r.user_id);
      if (userIds.length === 0) return [];
      const { data } = await (supabase as any)
        .from("profiles")
        .select("user_id, nome, email")
        .in("user_id", userIds);
      return data || [];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Sessão expirada");
      const updates: any = {
        urgencia,
        data_prevista_atendimento: dataPrevista ? new Date(dataPrevista).toISOString() : null,
        duracao_estimada: parseInt(duracao) || 120,
      };
      let novoStatus: string | null = null;
      if (consultorId && consultorId !== solicitacao.consultor_atribuido) {
        updates.consultor_atribuido = consultorId;
        if (["pendente", "aberta", "em_triagem"].includes(solicitacao.status)) {
          novoStatus = "atribuida";
        }
        await (supabase as any).from("solicitacoes_atribuicoes").insert({
          solicitacao_id: solicitacao.id,
          consultor_id: consultorId,
          atribuido_por: user.id,
          observacoes: observacoes || null,
          status: "atribuida",
        });
        await (supabase as any).from("solicitacoes_timeline").insert({
          solicitacao_id: solicitacao.id,
          tipo_evento: "atribuida",
          descricao: `Consultor atribuído${observacoes ? ` — ${observacoes}` : ""}`,
          usuario_id: user.id,
        });
      }
      if (dataPrevista) {
        if (
          !solicitacao.data_prevista_atendimento ||
          new Date(dataPrevista).toISOString() !==
            new Date(solicitacao.data_prevista_atendimento).toISOString()
        ) {
          if (!novoStatus && ["atribuida", "pendente", "aberta", "em_triagem"].includes(solicitacao.status)) {
            novoStatus = "agendada";
          }
          await (supabase as any).from("solicitacoes_timeline").insert({
            solicitacao_id: solicitacao.id,
            tipo_evento: solicitacao.data_prevista_atendimento ? "reagendada" : "agendada",
            descricao: `Visita ${solicitacao.data_prevista_atendimento ? "reagendada" : "agendada"} para ${formatDateTimeDisplay(dataPrevista)}`,
            usuario_id: user.id,
          });
        }
      }
      if (novoStatus) updates.status = novoStatus;
      const { error } = await (supabase as any)
        .from("portal_solicitacoes")
        .update(updates)
        .eq("id", solicitacao.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Atribuição atualizada");
      setObservacoes("");
      qc.invalidateQueries({ queryKey: ["solicitacoes-admin"] });
      qc.invalidateQueries({ queryKey: ["solicitacao-detalhe"] });
      qc.invalidateQueries({ queryKey: ["solicitacao-timeline"] });
      onChanged?.();
    },
    onError: (e: any) => {
      let msg = e.message || "Erro ao salvar";
      if (msg.includes("CONFLITO_AGENDA")) {
        msg = "Conflito: Já existe uma visita ocupando este horário para o consultor.";
      }
      toast.error(msg);
    },
  });

  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>Consultor responsável</Label>
          <Select value={consultorId} onValueChange={setConsultorId}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione um consultor" />
            </SelectTrigger>
            <SelectContent>
              {(consultores || []).map((c: any) => (
                <SelectItem key={c.user_id} value={c.user_id}>
                  {c.nome || c.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Urgência</Label>
          <Select value={urgencia} onValueChange={setUrgencia}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {URGENCIAS.map((u) => (
                <SelectItem key={u.value} value={u.value}>
                  {u.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>Data e hora prevista</Label>
          <Input
            type="datetime-local"
            value={dataPrevista}
            onChange={(e) => setDataPrevista(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label>Duração (minutos)</Label>
          <Select value={duracao} onValueChange={setDuracao}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="30">30 min</SelectItem>
              <SelectItem value="60">1h</SelectItem>
              <SelectItem value="90">1h 30min</SelectItem>
              <SelectItem value="120">2h</SelectItem>
              <SelectItem value="180">3h</SelectItem>
              <SelectItem value="240">4h</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-2">
        <Label>Observações para o consultor</Label>
        <Textarea
          value={observacoes}
          onChange={(e) => setObservacoes(e.target.value)}
          rows={3}
          placeholder="Instruções, contexto, prioridades..."
        />
      </div>
      <div className="flex gap-2 justify-end">
        <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
          {consultorId !== solicitacao.consultor_atribuido ? (
            <UserCheck className="h-4 w-4 mr-2" />
          ) : (
            <CalendarClock className="h-4 w-4 mr-2" />
          )}
          {saveMutation.isPending ? "Salvando..." : "Salvar atribuição"}
        </Button>
      </div>
    </div>
  );
}
