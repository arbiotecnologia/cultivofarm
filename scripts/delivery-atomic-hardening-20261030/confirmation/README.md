# Confirmação física manual — NO-GO local

Preparação local; nenhum acesso hosted, sessão, segredo, publicação ou fixture real.

## Resultado efetivamente executado

- Vitest entrega/envase: 494/494, 30 arquivos (vitest-final.log).
- Diálogo montado após proteção de timeout: 13/13 (confirm-timeout.log).
- Build automático observado OK; sem log de typecheck separado.
- PostgreSQL: rodada pg-exact.log FALHOU, exit_code 1. Não é uma bateria aprovada.
- Restore integral, composição aplicada, sentinelas existentes, instalação fechada, ensaio de grant exclusivamente descartável, attach/confirmação física, replay e isolamento estrangeiro passaram antes da falha.
- Primeiro sucesso preservou conteúdo financeiro/fiscal/outbox e estoque/ledger; não houve segunda expedição.
- Matrizes posteriores de revogação e cancelamento NÃO foram executadas nesta rodada e não podem ser certificadas.

## Bloqueio reproduzido

O comprovante digital canônico instalado recalcula entrega_comprovantes.validation_hash ao assinar, mas, quando reutiliza formulário existente, conserva entregas.validation_hash anterior (delivery-proof-authz candidate.sql.review, linhas 215 e 237). A confirmação exige concordância exata e corretamente nega DELIVERY_CONFIRM_PROOF_DENIED. O teste que esperava PT409 de CAS recebeu 42501 da prova: falha explícita, não tratada como PASS.

Não remover a concordância para contornar isso. É necessário preparar correção mínima da sincronização canônica, preservar a validação/token/objeto e repetir digital positivo, negativos e concorrência antes de liberar confirmação. O pacote ainda tem questões operacionais de avanço/finalização da OS a revisar sem inventar regras.

## Artefatos

install.sql.review mantém writer fechado; release.sql.review recusa ativação enquanto esta falha existir. PRE/POST são estados medidos da composição local capturada, não certificação do estado hosted. O auditor deve repetir PRE após o delta final. Rollback revoga, preserva história. Nenhum candidato desta pasta está liberável agora.

EnvasePage não oferece complemento, criar embalagens ou mutações de etiquetas; consulta e impressão existentes preservadas. Confirmação frontend exige capability exata imediatamente antes do dispatch, ACK exato, ator/empresa/época atual e mesma tentativa em incerteza. Demais contratos permanecem contidos.

## Evidência

logs/ contém saídas brutas finais, inclusive a falha PG e a rodada anterior que demonstrou ausência da tabela durante edição concorrente. sources.json e test-results.json preservam origem e resultado sem mascaramento. frontend.diff.txt é o diff real contra 5557f9ba, não um relato de publicação. SHA256SUMS cobre os artefatos desta preparação.