#!/usr/bin/env python3
"""Rollback SEGURO da candidata attachment-signing-stop-20261021.

NÃO restaura a baseline (ela reabriria createSignedUrls 3600s). Restaurar baseline/
é proibido por este script. O rollback seguro mantém o hook sem assinatura e apenas
torna os anexos técnicos/portais INDISPONÍVEIS (fail-closed), caso o download
autenticado precise ser suspenso. Nenhuma URL assinada é emitida.
"""
from pathlib import Path

STUB = '''// ROLLBACK SEGURO: anexos indisponíveis; nenhuma assinatura, nenhum download.
export function useSignedUrls(_paths: (string | null | undefined)[], _bucket = "consultor-arquivos", _options: { lazy?: boolean } = {}) {
  const noop = () => {};
  return { urls: {} as Record<string, string>, loading: false, loadingPaths: [] as string[], error: new Error("Anexo indisponível"), failed: [] as string[], refresh: noop, request: (_p: string) => {} };
}
'''
root = Path(__file__).resolve().parents[2]
target = root / "src/hooks/useSignedUrls.ts"
target.write_text(STUB)
for p in (root / "src").rglob("*.ts*"):
    if "test" in p.parts: continue
    s = p.read_text()
    assert "createSignedUrl" not in s, f"assinatura presente em {p}; abortar"
print("rollback seguro aplicado (fail-closed, sem assinatura)")
