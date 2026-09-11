import { Button } from "@/components/ui/button";
import { CatalogoQueryError } from "@/lib/catalogoQueries";

export function CatalogoQueryErrorState({ error, retry, busy }: {
  error: unknown; retry: () => unknown; busy: boolean;
}) {
  return (
    <div role="alert" className="space-y-3 py-6">
      <p>{error instanceof CatalogoQueryError ? error.message : "Não foi possível carregar o catálogo."}</p>
      <Button variant="outline" disabled={busy} onClick={() => { void retry(); }}>
        {busy ? "Tentando novamente…" : "Tentar novamente"}
      </Button>
    </div>
  );
}