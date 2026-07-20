import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Clock, FileEdit, FileQuestion, Archive } from "lucide-react";

interface Props {
  status: string | null | undefined;
  size?: "sm" | "md";
  /** Quando true, oculta o badge quando a ficha está aprovada (uso parceiro/comercial). */
  hideWhenApproved?: boolean;
}

export function TechnicalProfileStatusBadge({ status, size = "sm", hideWhenApproved = false }: Props) {
  if (hideWhenApproved && status === "aprovado") return null;
  const map: Record<string, { label: string; cls: string; Icon: typeof CheckCircle2 }> = {
    aprovado:   { label: "Ficha aprovada", cls: "bg-emerald-100 text-emerald-700 border-emerald-200", Icon: CheckCircle2 },
    em_revisao: { label: "Em revisão",     cls: "bg-amber-100 text-amber-700 border-amber-200",       Icon: Clock },
    rascunho:   { label: "Rascunho",       cls: "bg-slate-100 text-slate-700 border-slate-200",       Icon: FileEdit },
    arquivado:  { label: "Arquivada",      cls: "bg-zinc-100 text-zinc-600 border-zinc-200",          Icon: Archive },
  };
  const meta = status && map[status] ? map[status] : { label: "Sem ficha", cls: "bg-rose-50 text-rose-700 border-rose-200", Icon: FileQuestion };
  const { Icon } = meta;
  return (
    <Badge variant="outline" className={`${meta.cls} gap-1 ${size === "sm" ? "text-[10px] h-5 px-1.5" : "text-xs"}`}>
      <Icon className="h-3 w-3" /> {meta.label}
    </Badge>
  );
}
