import { Button } from "@/components/ui/button";
import { Download, Loader2 } from "lucide-react";
import { exportToCSV, buildExportFilename } from "@/lib/biExport";
import { useAuth } from "@/hooks/useAuth";
import { canAccessBISection, BISection } from "@/lib/biPermissions";
import { toast } from "sonner";
import { useState } from "react";

interface BIExportButtonProps {
  data: any[];
  headers: Record<string, string>;
  filenamePrefix: string;
  label?: string;
  variant?: "outline" | "ghost" | "default";
  className?: string;
  section?: BISection;
}


export function BIExportButton({ 
  data, 
  headers, 
  filenamePrefix, 
  label = "Exportar CSV",
  variant = "outline",
  className,
  section
}: BIExportButtonProps) {
  const { role } = useAuth();
  const [exporting, setExporting] = useState(false);
  
  // Se section não for informado, usa "exportacao" como fallback
  const hasAccess = canAccessBISection(role, section || "exportacao");

  if (!hasAccess) return null;


  const handleExport = async () => {
    if (!data || data.length === 0) {
      toast.info("Não há dados para exportar com os filtros atuais.");
      return;
    }

    setExporting(true);
    try {
      const filename = buildExportFilename(filenamePrefix);
      exportToCSV(data, headers, filename);
      toast.success(`Exportação ${filename} concluída com sucesso.`);
    } catch (error) {
      console.error("Erro na exportação:", error);
      toast.error("Falha ao exportar os dados.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <Button 
      variant={variant} 
      size="sm" 
      onClick={handleExport} 
      className={className}
      disabled={exporting}
    >
      {exporting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
      {label}
    </Button>
  );
}
