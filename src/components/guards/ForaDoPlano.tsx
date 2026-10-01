import { Link } from "react-router-dom";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ForaDoPlano() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="max-w-md space-y-4 text-center">
        <Lock className="mx-auto h-10 w-10 text-muted-foreground" aria-hidden="true" />
        <h1 className="text-xl font-semibold">Não incluído no seu plano</h1>
        <p className="text-sm text-muted-foreground">
          Esta área não faz parte do plano contratado pela sua empresa. Fale com o responsável
          pela conta para incluí-la.
        </p>
        <Button asChild variant="outline">
          <Link to="/">Voltar ao início</Link>
        </Button>
      </div>
    </div>
  );
}
