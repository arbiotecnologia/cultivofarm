import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { EtiquetaProdutoPrint, EtiquetaData } from "@/components/etiquetas/EtiquetaProdutoPrint";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";
import { toast } from "sonner";

export default function EtiquetaProdutoPrintPage() {
  const { id } = useParams<{ id: string }>();
  const [etiqueta, setEtiqueta] = useState<EtiquetaData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const { data, error } = await supabase
        .from("produto_etiquetas")
        .select("*")
        .eq("id", id)
        .single();
      if (error) {
        toast.error("Etiqueta não encontrada");
      } else {
        setEtiqueta(data as any);
      }
      setLoading(false);
    })();
  }, [id]);

  const handlePrint = async () => {
    if (!id) return;
    const { error } = await supabase.rpc("rpc_marcar_etiqueta_impressa", { p_etiqueta_id: id });
    if (error) {
      toast.error("Falha ao registrar impressão");
      return;
    }
    window.print();
  };

  if (loading) return <div className="p-6">Carregando...</div>;
  if (!etiqueta) return <div className="p-6">Etiqueta não encontrada</div>;

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div className="flex items-center justify-between print:hidden">
        <h1 className="text-xl font-bold">Etiqueta {etiqueta.codigo_etiqueta}</h1>
        <Button onClick={handlePrint}>
          <Printer className="h-4 w-4 mr-2" />
          Imprimir
        </Button>
      </div>
      <div className="flex justify-center">
        <EtiquetaProdutoPrint etiqueta={etiqueta} />
      </div>
      <style>{`
        @media print {
          @page { size: auto; margin: 5mm; }
          body { background: white; }
        }
      `}</style>
    </div>
  );
}
