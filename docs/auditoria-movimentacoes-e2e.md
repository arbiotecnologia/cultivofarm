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
