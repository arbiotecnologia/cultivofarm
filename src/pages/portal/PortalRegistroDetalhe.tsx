import { useParams, useNavigate, Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RoteiroVisita } from "@/components/visita/roteiro/RoteiroVisita";

export default function PortalRegistroDetalhe() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  return (
    <div className="max-w-4xl mx-auto px-3 sm:px-6 py-4">
      <div className="flex items-center gap-2 mb-3 print:hidden">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4 mr-1.5" /> Voltar
        </Button>
        <Link to="/portal/registros" className="text-xs text-muted-foreground hover:underline">
          Todos os registros
        </Link>
      </div>
      {id && <RoteiroVisita registroId={id} readOnly viewer="produtor" />}
    </div>
  );
}
