import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { useFluxoVisitaTecnica } from "@/hooks/useFluxoVisitaTecnica";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  MoreHorizontal,
  Eye,
  PlayCircle,
  XCircle,
  FileText,
  History,
  UserCheck,
  PackageCheck,
} from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { formatDateTimeDisplay } from "@/lib/date-utils";

interface Props {
  solicitacao: any;
  onOpenDetail: () => void;
  onOpenAtribuir?: () => void;
}

export function SolicitacaoActions({ solicitacao, onOpenDetail, onOpenAtribuir }: Props) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { iniciarVisita, converterRecomendacaoEmOS } = useFluxoVisitaTecnica();
  const [cancelDialog, setCancelDialog] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [isStarting, setIsStarting] = useState(false);

  const handleIniciarVisita = async () => {
    setIsStarting(true);
    try {
      await iniciarVisita(solicitacao.id);
    } finally {
      setIsStarting(false);
    }
  };

  const cancelMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Sessão expirada");
      const { error } = await (supabase as any)
        .from("portal_solicitacoes")
        .update({ status: "cancelada" })
        .eq("id", solicitacao.id);
      if (error) throw error;
      await (supabase as any).from("solicitacoes_timeline").insert({
        solicitacao_id: solicitacao.id,
        tipo_evento: "cancelada",
        descricao: motivo || "Cancelada sem motivo informado",
        usuario_id: user.id,
      });
    },
    onSuccess: () => {
      toast.success("Solicitação cancelada");
      setCancelDialog(false);
      setMotivo("");
      qc.invalidateQueries({ queryKey: ["solicitacoes-admin"] });
    },
    onError: (e: any) => toast.error(e.message || "Erro ao cancelar"),
  });

  const gerarPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text(`Solicitação ${solicitacao.numero_solicitacao || ""}`, 14, 18);
    doc.setFontSize(10);
    doc.text(
      `Aberta em ${formatDateTimeDisplay(solicitacao.created_at)}`,
      14,
      26
    );

    autoTable(doc, {
      startY: 32,
      theme: "grid",
      head: [["Campo", "Valor"]],
      body: [
        ["Cliente", solicitacao.clientes?.nome || "—"],
        ["Fazenda", solicitacao.fazendas?.nome || "—"],
        ["Talhão", solicitacao.talhoes?.nome || "—"],
        ["Tipo", solicitacao.tipo_demanda || "—"],
        ["Urgência", solicitacao.urgencia || "—"],
        ["Status", solicitacao.status || "—"],
        ["Origem", solicitacao.origem_solicitacao || "—"],
        ["Solicitante", solicitacao.solicitante_nome || "—"],
        ["Contato", solicitacao.solicitante_contato || "—"],
        [
          "Data prevista",
          solicitacao.data_prevista_atendimento
            ? formatDateTimeDisplay(solicitacao.data_prevista_atendimento)
            : "—",
        ],
      ],
      styles: { fontSize: 9 },
    });

    if (solicitacao.descricao) {
      const y = (doc as any).lastAutoTable.finalY + 8;
      doc.setFontSize(11);
      doc.text("Descrição", 14, y);
      doc.setFontSize(9);
      const lines = doc.splitTextToSize(solicitacao.descricao, 180);
      doc.text(lines, 14, y + 6);
    }

    doc.save(`${solicitacao.numero_solicitacao || "solicitacao"}.pdf`);
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem onClick={onOpenDetail}>
            <Eye className="h-4 w-4 mr-2" /> Abrir
          </DropdownMenuItem>
          {onOpenAtribuir && (
            <DropdownMenuItem onClick={onOpenAtribuir}>
              <UserCheck className="h-4 w-4 mr-2" /> Atribuir / Agendar
            </DropdownMenuItem>
          )}
          {!["concluida", "cancelada"].includes(solicitacao.status) && (
            <DropdownMenuItem onClick={handleIniciarVisita} disabled={isStarting}>
              <PlayCircle className="h-4 w-4 mr-2" /> 
              {isStarting ? "Iniciando..." : "Iniciar visita"}
            </DropdownMenuItem>
          )}
          {solicitacao.status === "aguardando_decisao_produtor" && (
            <DropdownMenuItem 
              onClick={async () => {
                const { data: visit } = await (supabase as any)
                  .from("registros_consultor")
                  .select("id")
                  .eq("solicitacao_id", solicitacao.id)
                  .eq("status", "aprovado")
                  .maybeSingle();
                
                if (visit) {
                  const res = await converterRecomendacaoEmOS(visit.id);
                  if (res.success) {
                    toast.success(res.message);
                    qc.invalidateQueries({ queryKey: ["solicitacoes-admin"] });
                  } else toast.error(res.message);
                } else {
                  toast.error("Não foi possível localizar uma recomendação aprovada para esta solicitação.");
                }
              }}
            >
              <PackageCheck className="h-4 w-4 mr-2" /> Gerar OS de Produção
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={gerarPDF}>
            <FileText className="h-4 w-4 mr-2" /> Gerar PDF
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onOpenDetail}>
            <History className="h-4 w-4 mr-2" /> Ver histórico
          </DropdownMenuItem>
          {!["concluida", "cancelada"].includes(solicitacao.status) && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => setCancelDialog(true)}
                className="text-destructive focus:text-destructive"
              >
                <XCircle className="h-4 w-4 mr-2" /> Cancelar
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={cancelDialog} onOpenChange={setCancelDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar solicitação</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Motivo do cancelamento</Label>
            <Textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={3}
              placeholder="Informe o motivo..."
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelDialog(false)}>
              Voltar
            </Button>
            <Button
              variant="destructive"
              onClick={() => cancelMutation.mutate()}
              disabled={cancelMutation.isPending}
            >
              Confirmar cancelamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
