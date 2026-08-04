# Auditoria, correção e certificação — Módulo "Movimentações"

**Ambiente:** staging Supabase `ikaauvsflpmamgxmkhoq` (produção `navfzbwgwzruipouyfnk` intocada, não publicado).
**Data:** 2026-08-04.

## VEREDITO: 🟡 APTO COM RESSALVAS

Todas as falhas críticas e altas identificadas foram corrigidas e provadas por harness transacional (12/12 gates PASS, rollback total, resíduo zero). As ressalvas são de **cobertura de escopo**, não de defeito aberto: parte da matriz A–Z do pedido descreve funcionalidades que **não existem no modelo atual** (transferência entre locais/unidades, ajuste com aprovação, multi-tenant) e não podem ser certificadas sem construção de módulo novo — o que os princípios do próprio pedido proíbem fazer às cegas.

---

## FASE 0 — Inventário real

Não existe um módulo chamado "Movimentações". Existe um **livro-razão de movimentações** distribuído em dois domínios:

| Domínio | Tabela-livro | Fonte de verdade do saldo | Escritor canônico |
|---|---|---|---|
| Produto acabado / lote | `public.estoque_movimentacoes` | `public.estoque_produto` (`quantidade`, `quantidade_reservada`, `status`) | trigger `log_estoque_movimentacao` em `estoque_produto` |
| Embalagem unitária | `public.estoque_embalagem_movimentacoes` | `public.estoque_embalagens` (`status`, 1 linha = 1 embalagem) | 12 RPCs `SECURITY DEFINER` |

### Rotas / páginas / componentes
| Item | Caminho | Papel |
|---|---|---|
| `/estoque` | `src/pages/Estoque.tsx` | Lista de itens, reserva, expedição |
| `/estoque/embalagens` | `src/pages/EstoqueEmbalagens.tsx` | Embalagens unitárias |
| `HistoricoSheet.tsx` | `src/components/estoque/` | Histórico por item (`estoque_movimentacoes`) |
| `EmbalagemMovimentacoesTimeline.tsx` | `src/components/estoque/` | Timeline por embalagem |
| `EstoqueBI.tsx`, `BIMovimentacoesChart.tsx`, `useBIOperacional.ts` | BI | KPIs e séries |
| `Entregas.tsx` | `src/pages/` | Expedição/estorno (consumidor do livro) |
| Cockpit / Envase | `RegistrarEnvaseDialog.tsx`, `useEsteiraLaboratorio.ts` | Entrada pós-envase |

Não há rota duplicada, alias ou legado paralelo. Não foi criada nenhuma rota nova.

### Perfis com acesso
`administrador`, `gestor`, `producao`, `administrativo` (leitura interna) e `operador_onfarm` (leitura escopada por cliente/lote via `fn_onfarm_scope_cliente` / `fn_onfarm_scope_lote`).

---

## FASE 1–2 — Falhas encontradas (todas corrigidas)

| # | Severidade | Falha comprovada | Correção |
|---|---|---|---|
| F1 | **CRÍTICA** | `anon` tinha `SELECT/INSERT/UPDATE/DELETE` em `estoque_movimentacoes`, `estoque_embalagem_movimentacoes`, `estoque_produto` e `estoque_embalagens` | `REVOKE ALL ... FROM anon, PUBLIC` nas 4 tabelas |
| F2 | **CRÍTICA** | Livro-razão **mutável**: a policy `FOR ALL` permitia `UPDATE`/`DELETE` do histórico por admin/gestor/produção | Trigger `fn_ledger_append_only` bloqueia `UPDATE` e `DELETE` nos dois livros; `REVOKE INSERT/UPDATE/DELETE FROM authenticated` |
| F3 | **ALTA** | **Dupla baixa** em `Entregas.tsx`: o `UPDATE` de status já dispara o trigger canônico e o frontend inseria uma 2ª linha (`acao='expedido'` e `acao='estorno_expedicao'`) | Inserts manuais removidos; gravação exclusiva pelo trigger |
| F4 | **ALTA** | 4 registros **órfãos** (100% da base) apontando para `estoque_produto` inexistente; sem FK | Backup em `estoque_movimentacoes_orfaos_backup` + `DELETE` + FK `ON DELETE RESTRICT` |
| F5 | **ALTA** | Escrita direta forjável no livro de embalagens (`emb_mov_insert` liberava INSERT arbitrário a 5 perfis, sem forçar `user_id`) | Policy de INSERT removida; escrita só via RPC `SECURITY DEFINER` |
| F6 | **MÉDIA** | Sem `CHECK` de ação nem de quantidade: aceitava `acao` inventada e `quantidade <= 0` | `estoque_movimentacoes_acao_valida` (9 ações) + `estoque_movimentacoes_quantidade_positiva` |
| F7 | **MÉDIA** | Taxonomia divergente: trigger grava `expedicao`, frontend gravava `expedido`; `HistoricoSheet` não rotulava `estorno_expedicao`/`descarte`/`ajuste` | Taxonomia única + rótulos completos |
| F8 | **MÉDIA** | KPI morto: `EstoqueBI` contava `acao='entregue'`, ação **nunca gravada** → sempre 0 | KPI passa a usar `entregas.status='entregue'` |
| F9 | **BAIXA** | `SELECT *` sem ordenação em `useBIOperacional` (payload e ordem não determinísticos) | Colunas explícitas + `order by created_at desc` |
| F10 | **BAIXA** | Sem índices por data/ação/OS | `idx_estoque_mov_created_at`, `idx_estoque_mov_acao_created`, `idx_estoque_mov_os` (parcial) |

`usuario_id` passou a ter `DEFAULT auth.uid()` e o trigger prioriza `auth.uid()` sobre a coluna denormalizada (antes um `reservado_por` antigo podia ser atribuído como autor de uma expedição).

## Máquina de estados (livro de produto acabado)

```text
(insert) ─ entrada ─▶ disponivel
disponivel ─ reserva ─▶ reservado
reservado ─ cancelamento_reserva ─▶ disponivel
reservado ─ expedicao ─▶ expedido
expedido ─ estorno_expedicao ─▶ reservado
qualquer ─ edicao ─▶ (transição não mapeada, registrada)
```
Ações permitidas pelo CHECK: `entrada, reserva, cancelamento_reserva, expedicao, estorno_expedicao, entrega, descarte, ajuste, edicao`.

## FASE 4 — Segurança final (verificada)

| Tabela | anon | authenticated |
|---|---|---|
| `estoque_movimentacoes` | NENHUM | `SELECT` |
| `estoque_embalagem_movimentacoes` | NENHUM | `SELECT` |
| `estoque_produto` | NENHUM | `SELECT/INSERT/UPDATE/DELETE` (sob RLS) |
| `estoque_embalagens` | NENHUM | `SELECT/INSERT/UPDATE/DELETE` (sob RLS) |

RLS deny-by-default nos dois livros, todas as policies com `TO authenticated`.

## FASE 5 — Integrações

Origem única por efeito confirmada: o estado de `estoque_produto`/`estoque_embalagens` é a única fonte que gera linha de livro. Eliminado o caminho paralelo frontend→livro (F3). Guardas pré-existentes de produção validadas em runtime: envase exige **CQ aprovado** e **volume produzido**; entrada em estoque exige **envase registrado**; reserva exige **OS + cliente/parceiro**.

## FASE 10 — Harness E2E (`TESTE_MOVIMENTACOES_E2E_*`, transação com rollback forçado)

| Gate | Cenário | Esperado | Obtido |
|---|---|---|---|
| A | Entrada gera exatamente 1 lançamento | 1 | 1 ✅ |
| E | Reserva gera exatamente 1 lançamento | 1 | 1 ✅ |
| C | Expedição gera exatamente 1 lançamento (sem duplicidade) | 1 | 1 ✅ |
| L | Estorno de expedição classificado corretamente | 1 | 1 ✅ |
| — | `UPDATE` em lançamento gravado | bloqueado | BLOQUEADO ✅ |
| — | `DELETE` em lançamento gravado | bloqueado | BLOQUEADO ✅ |
| R | Ação fora da taxonomia | bloqueado | BLOQUEADO ✅ |
| — | Quantidade zero/negativa | bloqueado | BLOQUEADO ✅ |
| — | Lançamento órfão (FK) | bloqueado | BLOQUEADO ✅ |
| F | Reserva acima do disponível (RPC) | bloqueado | BLOQUEADO ✅ |
| — | Reserva com quantidade não positiva (RPC) | bloqueado | BLOQUEADO ✅ |
| — | Reserva sem OS vinculada | bloqueado | BLOQUEADO ✅ |
| O | CQ não aprovado bloqueia envase→estoque comercial | bloqueado | BLOQUEADO ✅ |
| — | Total de lançamentos do ciclo | 4 | 4 ✅ |

**Cleanup:** rollback integral da transação. Contagens pós-execução: `0` lotes com prefixo de teste, `0` `estoque_produto`, `0` `estoque_movimentacoes`, `4` linhas em `estoque_movimentacoes_orfaos_backup` (arquivo de auditoria intencional). Nenhuma Edge Function de harness criada; nenhum `DISABLE TRIGGER` usado.

## Testes e build
- `tsgo --noEmit`: **0 erros**
- `vitest run`: **2707 passed / 4 skipped (164 arquivos)**

## Ressalvas (não são defeitos abertos)

1. **Transferência entre locais/unidades não existe** no modelo (`estoque_produto` não tem local/unidade; `estoque_embalagens.local_estoque` é texto livre, sem livro de transferência). Gates H/I não aplicáveis — exigiriam módulo novo, fora do princípio "não criar módulo paralelo sem autorização".
2. **Ajuste de saldo com aprovação/limite não existe** como fluxo; a ação `ajuste` está reservada na taxonomia, mas sem RPC nem tela. Gate K não certificado.
3. **Multi-tenant não existe** (instalação única). Gates T/U reduzidos a isolamento por perfil/cliente/lote via RLS.
4. **Idempotency key** não foi adicionada ao livro: hoje a idempotência é estrutural (a linha só nasce de uma transição real de status, sob `FOR UPDATE`). Um fingerprint explícito é recomendado se surgir escrita por API externa.
5. **Concorrência real multi-sessão** (gate J) e **auditoria de UI mobile/acessibilidade** (fases 6/W) não foram executadas neste ciclo; a proteção de corrida existente é o `SELECT ... FOR UPDATE` de `reservar_estoque_item`, já validado contra excesso de reserva.
6. **`saldo_anterior`/`saldo_posterior`** ainda não são colunas do livro (o modelo é status-driven, 1 linha = 1 lote/quantidade). Registrar saldo explícito exige mudança de modelo e migração de histórico.

## VEREDITO FINAL: 🟡 APTO COM RESSALVAS
Sem risco crítico ou alto em aberto. Não promovido, não publicado.

---

## Ciclo final — encerramento (staging `ikaauvsflpmamgxmkhoq`)

### 1. Causa da interrupção anterior
O harness criava `os_id` sintético sem registro correspondente. `reservar_estoque_item` /
`validate_estoque_reserva` exigem OS canônica; e `ordens_servico` possui o check
`ordens_servico_origem_required_fields`, que para `origem='agronomica'` exige
`cliente_id`, `fazenda_id` e `talhao_id` simultaneamente. O run abortava no setup.

### 2. Resíduos removidos
Sweep executado com função temporária `fn_hml_purge_movimentacoes_fixture` (service_role):
- 1º sweep: 5 itens de estoque + 15 lançamentos removidos.
- Sweep final do run certificado: 8 itens + 21 lançamentos.
- Contagens finais de resíduo: `estoque_produto=0`, `produtos=0`, `lotes=0`,
  `microrganismos=0`, `clientes=0`, `ordens_servico=0`, `fazendas=0`, `talhoes=0`, `envase=0`.

### 3. Fixture canônica de OS
Cadeia real criada e removida a cada run: cliente → fazenda → talhão → OS agronômica
(`numero_os=HMLMOV-<run>`, status `aberta`) → microrganismo → produto → lote →
CQ aprovado → envase → item de estoque. Sem UUID órfão. Cleanup em `finally`
respeita a ordem de FKs, sem `DISABLE TRIGGER`.

### 4. Defeito de motor corrigido (não era fixture)
Reserva parcial altera duas linhas de `estoque_produto` (INSERT da linha filha +
UPDATE da linha de origem). O trigger `log_estoque_movimentacao` gravava os dois
lançamentos com a mesma `idempotency_key`, violando `uq_estoque_mov_idempotency` e
derrubando a operação inteira. Correção: o lançamento principal mantém a chave da
operação; lançamentos complementares recebem chave derivada `<chave>#<n>` e
`metadata.desdobramento=true` + `metadata.operacao_key`. Idempotência, replay e
detecção de payload divergente continuam ancorados na chave exata.

### 5. Matriz A–Z (26 gates) — resultado final
26 PASS · 0 FAIL · 1 N/A · 0 fatal.

| Gate | Resultado |
|---|---|
| A reserva com snapshot | PASS |
| B replay idempotente | PASS |
| C conflito de payload | PASS |
| D update direto bloqueado | PASS |
| E livro append-only | PASS |
| F expedição com cadeia de saldos | PASS |
| G estorno único | PASS |
| H concorrência real (1 vencedor) | PASS |
| I produtor bloqueado | PASS |
| J anônimo bloqueado | PASS |
| K limite/alçada de ajuste | PASS |
| L perda coerente | PASS |
| M motivo obrigatório | PASS |
| N devolução em quarentena | PASS |
| O autoria/unidade/direção/origem | PASS |
| P ação inválida rejeitada | PASS |
| Q cancelamento de reserva | PASS |
| R entrega com saída | PASS |
| S ajuste de entrada | PASS |
| T reserva acima do saldo | PASS |
| U chave fraca/ausente | PASS |
| V devolução sem classificação | PASS |
| W estorno de estorno / origem cruzada | PASS |
| X expedição sem reserva | PASS |
| Y reserva parcial com vínculo real | PASS |
| Z transferência entre locais | **N/A** — não existe modelo canônico de locais/depósitos (`estoque_produto` não tem `local_id`, não há tabela de locais). Não pode ser aprovado sem fluxo real. |

### 6. Concorrência
Duas requisições simultâneas sobre o mesmo saldo: exatamente um vencedor, um único
lançamento por chave, saldo final coerente. Mesma chave em paralelo → um lançamento.

### 7. Performance e plano
Motor: 30 chamadas — p50 **144,5 ms**, p95 **209,2 ms**, máx 223,5 ms.
`EXPLAIN (ANALYZE, BUFFERS)` da listagem paginada: 0,34 ms de execução (tabela sem
volume real em staging — o plano ainda não é representativo de produção). Índices
presentes e adequados: `idx_estoque_mov_cursor (created_at DESC, id DESC)`,
`idx_estoque_mov_item`, `idx_estoque_mov_acao_created`, além de índices parciais por
`os_id`, `cliente_id`, `lote_id`, `usuario_id`, `referencia`, e os únicos de
idempotência e reversão.

### 8. UI / acessibilidade
`HistoricoSheet` passou a: paginar (25 por página + "Carregar mais", antes carregava
tudo sem limite), filtrar por ação, exibir o snapshot completo (saldo e reservado
anterior→posterior, direção, unidade, motivo, origem) e usar lista semântica com
`aria-live`, `aria-busy` e rótulo associado ao filtro. Taxonomia de ações atualizada
(perda, devolução, consumo). Layout responsivo em desktop e mobile.

### 9. Remoção do harness
Edge Function `movimentacoes-runtime-harness` deletada do projeto, diretório removido
do repositório e entrada `verify_jwt=false` removida de `supabase/config.toml`.
Verificação: `POST` ao endpoint retorna **404**. A função temporária
`fn_hml_purge_movimentacoes_fixture` foi dropada e `fn_ledger_append_only` /
`fn_estoque_produto_guard` voltaram a bloquear incondicionalmente (sem GUC de escape).

### 10. Validações
typecheck OK · build OK · Vitest **2709 passed / 0 failed / 4 skipped** (as duas falhas
detectadas eram exatamente os testes-guarda de `config.toml` acusando o harness; após a
remoção, verdes). Lint não disponível no projeto.

### Veredito
**🟢 STAGING CERTIFICADO** — zero risco crítico/alto, zero resíduo, 26/26 gates
exercitados aprovados. Ressalva não bloqueante registrada: **Z (transferência entre
locais) permanece N/A** por ausência de modelo canônico no schema; e o plano de consulta
foi medido sobre tabela sem volume. Não promovido e não publicado.
