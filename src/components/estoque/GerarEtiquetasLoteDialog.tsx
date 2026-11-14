import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EtiquetaProdutoActions } from "@/components/etiquetas/EtiquetaProdutoActions";

export interface EmbalagemLoteOption {
  id: string;
  lote_id?: string | null;
  codigo_embalagem: string;
  etiqueta_id?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  embalagens: EmbalagemLoteOption[];
  onDone?: () => void;
}

/** Mapeia erros canônicos do motor de etiquetas para mensagens acionáveis. */
export function traduzirErroEtiqueta(message: string): string {
  if (message.includes("label_expiry_not_validated"))
    return "Validade não validada: defina validade na embalagem/estoque ou política de validade no perfil de conformidade aprovado.";
  if (message.includes("label_compliance_profile_missing"))
    return "Não há perfil de conformidade aprovado vigente para este produto.";
  if (message.includes("label_compliance_field_missing"))
    return "Perfil de conformidade incompleto (responsável técnico, registro ou textos obrigatórios).";
  if (message.includes("label_cq_not_approved"))
    return "Lote sem aprovação de CQ: etiqueta comercial bloqueada.";
  if (message.includes("label_template_not_found"))
    return "Modelo de etiqueta inexistente ou inativo.";
  if (message.includes("label_batch_too_large"))
    return "Máximo de 500 embalagens por execução.";
  if (message.includes("label_batch_empty"))
    return "Selecione ao menos uma embalagem.";
  return message;
}

export function GerarEtiquetasLoteDialog({ open, onOpenChange, embalagens, onDone }: Props) {
  const lots = [...new Set(embalagens.map(e => e.lote_id).filter((id): id is string => Boolean(id)))];
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent aria-describedby={undefined}><DialogHeader><DialogTitle>Etiquetas por lote e recipiente</DialogTitle></DialogHeader>
    {lots.length ? lots.map(id => <div key={id} className="border-b py-2"><p className="text-xs font-mono break-all mb-2">Lote {id}</p><EtiquetaProdutoActions loteId={id} onChanged={onDone} /></div>) : <p>Nenhum lote disponível nesta seleção.</p>}
  </DialogContent></Dialog>;
}

