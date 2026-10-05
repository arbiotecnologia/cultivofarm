import { Link } from "react-router-dom";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ForaDoPlanoProps {
  status?: "loading" | "error" | "legacy_unversioned" | "blocked" | "no_subscription" | "ready" | "platform_superadmin";
}

export default function ForaDoPlano({ status }: ForaDoPlanoProps) {
  const carregando = status === "loading";
  const legado = status === "legacy_unversioned";
  const indisponivel = status === "error";
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="max-w-md space-y-4 text-center">
        <Lock className="mx-auto h-10 w-10 text-muted-foreground" aria-hidden="true" />
        <h1 className="text-xl font-semibold">{carregando ? "Verificando sua assinatura" : legado ? "Regularização comercial pendente" : indisponivel ? "Não foi possível verificar sua assinatura" : "Recurso indisponível"}</h1>
        <p className="text-sm text-muted-foreground">
          {carregando
            ? "Aguarde enquanto confirmamos os recursos disponíveis para sua empresa."
            : legado
              ? "Sua assinatura ainda não possui uma versão comercial validada. Os dados existentes permanecem preservados."
              : indisponivel
                ? "Por segurança, esta área permanece bloqueada. Tente novamente mais tarde."
                : "A situação atual da assinatura ou do plano não libera esta área. Fale com o administrador da empresa."}
        </p>
        <Button asChild variant="outline">
          <Link to="/">Voltar ao início</Link>
        </Button>
      </div>
    </div>
  );
}
