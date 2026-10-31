# Confirmação física manual — provas locais ampliadas, NO-GO de release

Preparação local; nenhum acesso hosted, sessão, segredo, publicação ou fixture real.

## Resultado efetivamente executado

- Vitest entrega/envase/etiquetas: 504/504, 32 arquivos (vitest-current.log).
- Diálogo montado após proteção de timeout: 13/13 (confirm-timeout.log).
- Build automático observado OK; sem log de typecheck separado.
- PostgreSQL: pg-current.log PASS, exit_code 0; test-results.json contém contagem e SQLSTATEs exatos. Rodadas históricas falhadas permanecem nos logs, não compõem a aprovação atual.
- Restore integral, composição aplicada, sentinelas existentes, instalação fechada, ensaio de grant exclusivamente descartável, attach/confirmação física, replay e isolamento estrangeiro passaram antes da falha.
- Primeiro sucesso preservou conteúdo financeiro/fiscal/outbox e estoque/ledger; não houve segunda expedição.
- Executados: digital com formulário reutilizado e novo, hash adulterado/objeto ausente/foreign owner, CAS válido e stale, singleton ausente, replay, revogação de perfil/papel/tenant/SaaS DURANTE lock observado, cancelamento canônico vence confirmação PT409, confirmação impede cancelamento ordinário, parcial envase + dois itens, segundo item com OS entregue, invariantes integrais de 14 tabelas downstream.
- Restore integral original passou; reruns finais usam pg_dump local dessa composição aplicada e fixtures, papéis capturados restaurados. Nenhum transporte hosted. O checkpoint está em /tmp e não é artefato deployável.

## Bloqueio reproduzido

O comprovante digital canônico instalado recalcula entrega_comprovantes.validation_hash ao assinar, mas, quando reutiliza formulário existente, conserva entregas.validation_hash anterior (delivery-proof-authz candidate.sql.review, linhas 215 e 237). A confirmação exige concordância exata e corretamente nega DELIVERY_CONFIRM_PROOF_DENIED. O teste que esperava PT409 de CAS recebeu 42501 da prova: falha explícita, não tratada como PASS.

Corrigido por delta mínimo gerado do corpo canônico: token/hash do comprovante atualizado são adotados atomicamente pela entrega, inclusive no formulário reutilizado; demais guards/ACL/recibos e writers preservados. Igualdade não foi removida. Ledger de replay agora exige os mesmos campos referencia_tipo/os_id/os_tipo/lote_id do primeiro sucesso.

Finalização agora mede volume por programação/produto em mililitros, não soma contagens incompatíveis; canceladas/estornadas não cobrem demanda. Primeiro de dois itens não finaliza; segundo completa 5000ml. Ainda faltam provas específicas de múltiplos lotes/produtos, canceladas/reserva estornada como cobertura, corridas assinatura/anexo versus confirmação e alteração de lineage no replay. Não há decisão humana identificada: são lacunas de teste locais, não motivo para relaxar regras. Release permanece NO-GO até concluir essas matrizes.

## Artefatos

install.sql.review mantém writer fechado; release.sql.review recusa ativação enquanto as matrizes acima estiverem pendentes. PRE/POST medidos incluem delta proof mínimo; não certificam hosted. Rollback revoga confirmação e mantém sincronização segura/história. Nenhum candidato desta pasta está liberável agora.

EnvasePage não oferece complemento, criar embalagens ou mutações de etiquetas; consulta e impressão existentes preservadas. Confirmação frontend exige capability exata imediatamente antes do dispatch, ACK exato, ator/empresa/época atual e mesma tentativa em incerteza. Demais contratos permanecem contidos.

## Evidência

logs/ contém saídas brutas finais, inclusive a falha PG e a rodada anterior que demonstrou ausência da tabela durante edição concorrente. sources.json e test-results.json preservam origem e resultado sem mascaramento. frontend.diff.txt é o diff real contra 5557f9ba, não um relato de publicação. SHA256SUMS cobre os artefatos desta preparação.