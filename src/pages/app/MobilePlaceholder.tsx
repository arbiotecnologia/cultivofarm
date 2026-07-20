import { Construction } from "lucide-react";
import { useLocation } from "react-router-dom";

export default function MobilePlaceholder() {
  const location = useLocation();
  const pageName = location.pathname.split("/").pop() || "Página";

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center">
      <Construction className="h-12 w-12 text-muted-foreground mb-4" />
      <h2 className="text-lg font-semibold text-foreground capitalize">{pageName}</h2>
      <p className="text-sm text-muted-foreground mt-2">
        Esta funcionalidade estará disponível em breve.
      </p>
    </div>
  );
}
