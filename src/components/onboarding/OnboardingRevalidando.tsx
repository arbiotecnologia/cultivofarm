import { Loader2 } from "lucide-react";

/** Tela neutra enquanto o estado do cadastro é revalidado: nunca exibe conteúdo/formulário antigo. */
export function OnboardingRevalidando({ erro, onTentar }: { erro?: boolean; onTentar?: () => void }) {
  return (
    <div role="status" aria-live="polite" className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center">
      {!erro && <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden />}
      <p className="text-sm text-muted-foreground">
        {erro ? "Não foi possível confirmar a situação do cadastro da empresa." : "Verificando a situação do cadastro da empresa…"}
      </p>
      {erro && onTentar && (
        <button type="button" onClick={onTentar} className="min-h-11 rounded-md border px-4 text-sm">Tentar novamente</button>
      )}
    </div>
  );
}
