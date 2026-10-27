# Pacote de liberação da entrega (integrado a estoque/envase) — INATIVO

## Premissa corrigida
O pacote de estoque e envase (`scripts/stock-envase-recovery-20261027/`, commit 03b1bbfa6) **não foi aplicado** em produção. O novo pacote será montado como **composição única revisável** (estoque/envase + entrega), testada junta em banco descartável. Nada é aplicado nem publicado; a instalação fica com o auditor.

## Riscos a resolver (registrados nos dois pacotes)
1. Gate SHARE (estoque) x EXCLUSIVE (entrega) pode travar/deadlock.
2. Conclusão do envase bloqueada (`ENVASE_TRANSITION_REVIEW_PENDING`).
3. Reserva parcial/lote em batch sem contrato definido.
4. Matriz B2B/onfarm sem composição homologada.
5. Escritores de revogação (perfis/papéis/convites) sem cooperação comprovada com o gate.
6. Integração com cobrança na entrega (`delivery-billing-scope-20261027`) não composta.

## Etapas
1. **Inventário LIVE somente leitura**: re-pinar hashes/ACL/gatilhos das funções de entrega, estoque, envase e cobrança; abortar se divergir das capturas.
2. **Ordem global de locks única**: gate canônico `cf_user_guards_v1` → OS → entrega → envase/lote → estoque (ordem por id) → recebível. Um só modo de gate para toda a cadeia; teste de duas conexões nos dois ordenamentos e prova sem deadlock.
3. **Conclusão do envase**: transição canônica envase → `pronto_entrega` pelo motor existente, sem criar ticket CQ nem contornar guards de lote/CQ.
4. **Reserva**: suportar apenas reserva total por lote nesta etapa; parcial/batch rejeitada com mensagem clara (PT409/PT400), sem perda de dados.
5. **B2B/onfarm**: manter fechados com mensagem segura; liberar só manual interno.
6. **Revogação**: verificar que os escritores canônicos de perfil/papel/convite passam pelo gate; se algum não cooperar, entregar dependência mínima identificada, sem ampliar acesso.
7. **Cobrança**: compor o candidato de cobrança na mesma transação da confirmação (categoria RECEITA e método ativos, sem fallback; falha aborta tudo).
8. **Liberação dos wrappers de entrega**: EXECUTE apenas a `authenticated` com autorização/tenant revalidados após cada espera, CAS obrigatório, idempotência, `lock_timeout 3s`.
9. **Pacote**: PRE/POST com pinos, candidato, release fail-closed, contenção deny-only (sem restaurar escape GUC), testes.

## Testes (PostgreSQL descartável, Auth sintética — não é homologação real)
Fluxo completo OS→envase→estoque→entrega→cobrança; A/B/anon; concorrência e replay; revogação durante espera; deadlock nos dois ordenamentos; rollback atômico com falha de ledger/cobrança; reserva parcial rejeitada; B2B negado. Vitest dos consumidores sem retry automático em PT409.

## Fora do escopo
Contabilidade, emissão fiscal real, comunicações externas, SU-518022, publicação e qualquer SQL em produção.

## Entrega
Diretório `scripts/delivery-stock-release-20261027/` com README/AGENTS, resultados discriminados e commit. Se algum risco não puder ser fechado com segurança, o pacote termina em NO-GO explícito em vez de reabrir.
