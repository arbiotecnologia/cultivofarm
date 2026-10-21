#!/usr/bin/env python3
"""Rollback SEGURO (fail-closed) da candidata fiscal-xml-download-blob-20261021.

NÃO restaura baseline/ (ela consumia URL assinada de 120s via window.open).
Mantém o frontend sem URL e torna o download de XML INDISPONÍVEL no cliente.
A Edge não é tocada por este script: se a candidata Edge já tiver sido
implantada, o rollback Edge seguro é retornar 410 na action download
(ver README), nunca reabrir createSignedUrl.
"""
from pathlib import Path
root = Path(__file__).resolve().parents[2]
hook = root / "src/hooks/useFiscalXmlEngine.ts"
s = hook.read_text()
marker = "export async function loadFiscalXmlArtifact("
assert marker in s, "loader ausente; abortar"
head = s[: s.index(marker)]
hook.write_text(head + '''export async function loadFiscalXmlArtifact(_key: string, _signal: AbortSignal): Promise<Blob> {
  // ROLLBACK SEGURO: download de XML indisponível; nenhuma URL, nenhum byte.
  throw new Error("Arquivo indisponível");
}
''')
for f in ("src/hooks/useFiscalXmlEngine.ts", "src/components/fiscal/documentos/GeracaoXmlNfeSecao.tsx"):
    t = (root / f).read_text()
    assert "createSignedUrl" not in t and "window.open" not in t, f"URL presente em {f}; abortar"
print("rollback seguro aplicado (download XML indisponível, sem URL)")
