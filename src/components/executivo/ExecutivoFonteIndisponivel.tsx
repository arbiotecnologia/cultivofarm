import { AlertTriangle } from "lucide-react";

export function ExecutivoFonteIndisponivel() {
  return (
    <section role="status" className="flex items-start gap-3 border border-border p-4 text-muted-foreground">
      <AlertTriangle className="h-5 w-5 shrink-0" aria-hidden="true" />
      <div>
        <h3 className="font-semibold text-foreground">Dados executivos indisponíveis</h3>
        <p className="text-sm">Fontes sem vínculo organizacional comprovado. Consultas e ações de relatórios permanecem bloqueadas.</p>
      </div>
    </section>
  );
}