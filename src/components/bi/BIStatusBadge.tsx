import { Database } from "@/integrations/supabase/types";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface BIStatusBadgeProps {
  status: string;
  type: "visita" | "os" | "esteira" | "gravidade";
  className?: string;
}

export function BIStatusBadge({ status, type, className }: BIStatusBadgeProps) {
  if (!status) return null;

  const getStyle = () => {
    const s = status.toLowerCase();
    
    if (type === "gravidade") {
      if (s === "critica") return "bg-red-600 text-white hover:bg-red-700";
      if (s === "alta") return "bg-orange-500 text-white hover:bg-orange-600";
      if (s === "media") return "bg-yellow-500 text-white hover:bg-yellow-600";
      return "bg-blue-500 text-white hover:bg-blue-600";
    }

    if (["entregue", "finalizada", "concluida", "aprovado", "convertido_os"].includes(s)) {
      return "bg-green-100 text-green-800 border-green-200";
    }

    if (["cancelada", "reprovado", "atrasado"].includes(s)) {
      return "bg-red-100 text-red-800 border-red-200";
    }

    if (["em_producao", "programada", "em_cq", "envase"].includes(s)) {
      return "bg-blue-100 text-blue-800 border-blue-200";
    }

    return "bg-gray-100 text-gray-800 border-gray-200";
  };

  const label = status.replace(/_/g, " ");

  return (
    <Badge variant="outline" className={cn("capitalize font-semibold", getStyle(), className)}>
      {label}
    </Badge>
  );
}
