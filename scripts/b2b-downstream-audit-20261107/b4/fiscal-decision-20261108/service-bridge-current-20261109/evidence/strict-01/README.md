# strict-01 — limitação de preservação

Os arquivos `run.exitcode`, `run.stderr.txt` e `run.stdout.txt` são os logs originais da tentativa falha.

Em 09/11/2026, uma execução posterior sem `B4_EVIDENCE_OUT` atualizou indevidamente `evidence-b4-shared-impact.json` e `lock-ordering.json` neste diretório. Esses dois JSONs originais não estavam no HEAD e não puderam ser recuperados; não foram recriados nem apresentados como evidência histórica. O resultado válido posterior foi separado em `strict-09`, e o gerador passou a exigir destino único por processo quando a variável não é informada.

Esta limitação não altera os resultados independentes de `strict-08` ou `strict-09`, mas impede usar os dois JSONs perdidos como prova da tentativa 01.
