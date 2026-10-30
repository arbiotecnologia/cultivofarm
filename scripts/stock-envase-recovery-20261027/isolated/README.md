# Envase manual isolado — preparação, NÃO LIBERÁVEL ainda

Base local inicial: `2faf35638` (ancestral de `894ae9db6`). Aplicações `91cec22`/`2faf` são relatos do proprietário, não verificações hosted desta execução. **Nenhum acesso hosted, sessão/segredo produtivo, grant produção, publicação ou fixture real foi executado.** A referência cancelada `d7edc250-25a4-4ee2-8b62-27c1645cdfc0` não foi acessada/alterada.

## Delta mínimo já implementado
- Somente corpo da assinatura canônica de envase + capability específica somente leitura. Motor/batch/grupo, guards CQ/lote, permissões e efeitos downstream não são reinstalados.
- Corrige `FOUND` sobrescrito entre lock do singleton e validação; ausência do gate gera PT503 antes de escrita.
- Chave obrigatória; fingerprint suplementar inclui operador, motivo, ator, empresa e argumentos completos. Recibos históricos não são alterados: os que não têm fingerprint completo recusam repetição com `ENVASE_LEGACY_RECEIPT_REVIEW_REQUIRED`, conservando o resultado anterior.
- Replay reautoriza e não exige validade futura; escrita nova exige validade e OS `em_cq/envase` observada após lock. Nova chave em OS pronta não produz envase adicional.
- Capability exata vincula ator/empresa/lote/OS/programação e só informa disponível quando ACL da assinatura canônica está aberta. Não concede autoridade; corpo reautoriza.
- Cliente reutiliza tentativa incerta congelada; adiciona epoch/readiness/roles/session fence compartilhado e trava síncrona durante preflight+dispatch. Nenhuma capability ausente/errada abre o writer.
- Botões de registro/complemento permanecem desabilitados nesta preparação. Provas e histórico cancelado ficam intactos.

## Artefatos e guardas
`install`, `preflight`, `postflight`, `rollback`, `release`, `candidate`, `state` `.sql.review`, `pre-state.json`, `post-state.json`, `sources.json`, `SHA256SUMS`, resultados e logs brutos.
Estado completo dos corpos de funções public/private, ACL, owner/config, colunas, constraints, RLS/policies e definições/enabled de triggers relevantes. Ordenação por colunas explícitas `COLLATE "C"`; nada de contagens ou agregado `ORDER BY 1,2`. O PRE é derivado da restauração local exata dos instaladores relatados aplicados; o auditor precisa comparar com LIVE canônico. Corpo diferente ou função adicional também aborta: conservador, não equivalente a captura atual hosted.

`release.sql.review` **recusa aplicação com 42501**; não contém GRANT do writer. `install` mantém a ACL fechada. Rollback revoga a assinatura canônica, capability retorna indisponível e preserva corpos endurecidos/histórico/grupo/cancelamento/prova.

## Testes desta execução (não resultados históricos)
- PostgreSQL17 descartável em socket `/tmp`: **28 PASS / 0 FAIL**. Restaurador de metadata real sem objetos pendentes; oito instaladores com PRE/POST, ordem em `sources.json`. Fixtures upstream sintéticas em replica pelo harness existente; writers testados com triggers ligados e ROLE authenticated/claims sintéticas, nunca service_role como ator.
- Instalação/POST forçado/rerun/drift; gate ausente; chave ausente; produção AR positiva; FSF estrangeira 42501; replay/operador/nova chave/status; ator inativo; falha ledger com rollback; concorrência duas conexões uma gravação/um replay; **worker observado em wait_event_type=Lock** no lote antes do commit da inativação, negação 42501 sem envase; gerar/assinar/anexar/replay preservados na composição.
- Financeiro/fiscal/outbox: comparações de conteúdo de linhas, não apenas counts, antes/depois de envase. As dez tabelas estão vazias na fixture: **não prova proteção de UPDATE de sentinelas existentes**, lacuna explícita para release.
- Vitest entregas+envase: **457 PASS / 28 arquivos**, transporte simulado; recorte novo disponibilidade/epoch/cancelada **64 PASS**. Avisos de descrição de dialogs/React Router presentes, não erros de teste.
- Três falhas antigas em `stock-caller-compatibility.test.ts` foram reproduzidas pelo investigador: expectativas de expedição/estorno/implementação antiga incompatíveis com contenção atual. Não se removeu contenção nem se declarou suíte global verde.

Comandos:
```text
python3 scripts/stock-envase-recovery-20261027/isolated/test_pg.py
python3 scripts/stock-envase-recovery-20261027/isolated/test_order.py
bun run test -- src/test/entregas src/test/envase
```

## Blockers de release / etapas posteriores
1. Completar matriz de revogação DURANTE locks para papel, empresa, SaaS e CQ; apenas inativação de perfil após espera no lote está demonstrada nesta rodada. CQ/feature writers e isolamento REPEATABLE READ/cooperação de locks ainda precisam prova.
2. Entrada estoque ainda utiliza contexto de logger por GUC legado. Não é autorização, mas spoof e writers indiretos de entrada precisam fechamento/prova canônica antes de grant; não inventar ticket CQ ou abrir helper.
3. Cobertura/reserva da conclusão privada instalada depende de invariantes por OS. Provar tenant/lote/programação e estados de estoque com sentinelas conflitantes; helpers não alterados neste delta.
4. Financeiro/fiscal/outbox com sentinelas existentes, rollback de item N/timeout/POST, matrizes AR/FSF própria/mista/null/inativa e pós-validade real precisam ampliação. PASS atual não certifica estes cenários.
5. Vínculos de etiquetas e RPC pós-envase `rpc_criar_embalagens_pos_envase` exigem contratos independentes de lineage/tickets/ledger. Confirmação física permanece contida; não habilitar por envase. Dispensa NÃO expandida.
6. JWT/RLS/Storage/browser reais, preflight LIVE e implantação ficam com auditor após revisão. Nesta rodada nenhum fluxo autenticado produtivo foi exercitado; frontend verificado por testes montados, não navegador autenticado.

**Escopo liberável agora: nenhum novo writer.** Escopo implementado revisável: correções de envase e bloqueios/fences; group/cancel já relatados liberados preservados. Financeiro/fiscal/automações/cobranças permanecem fechados.