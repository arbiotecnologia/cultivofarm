# FASE 28C — Blindagem por testes do motor de estoque AR Bio

Escopo desta fase: criação de testes unitários e de contrato estático para o
motor de estoque, mais documentação. **Nenhuma** alteração de banco, migration,
RLS, RPC, Edge Function, Supabase client, carrinho, pedido B2B, portais,
precificação, catálogo, aprovação técnica ou lógica funcional. Nenhuma
biblioteca nova.

## 1. Auditoria da Fase 28B — **28B CERTIFICADA**

| Item auditado | Resultado |
| --- | --- |
| `docs/auditorias/estoque-fase28b-auditoria.md` existe (274 linhas) | OK |
| Registra "28A CERTIFICADA" (seção 1) | OK |
| Auditoria de estoque concluída (arquivos, funções puras × efeitos, RPCs, unidades, cockpit, entregas) | OK (seções 2–7) |
| Riscos críticos | Nenhum comprovado (seção 8) |
| Riscos altos A1 e A2 documentados e não corrigidos sem decisão humana | OK (seção 8) |
| 12 invariantes listadas | OK (seção 9) |
| Prompt 28C presente | OK (seção 11) |
| Migration/RLS/RPC/frontend funcional alterados na 28B | Nenhum (última migration segue `20260905000000_hardening_digest_schema_v1.sql`) |
| `src/test/estoque/estoque-fase28b-auditoria.test.ts` passa | OK (15 PASS) |
| Binding staging | Drift detectado no início desta fase (`.env` e `types.ts` regenerados para sandbox); restaurados ao baseline `c75bb87f` (staging `ikaauvsflpmamgxmkhoq`, `types.ts` com 21.850 linhas) antes de qualquer validação |

Conclusão: **28B ÍNTEGRA**. Blindagem por testes liberada.

## 2. Testes criados

| Arquivo | Cobertura |
| --- | --- |
| `src/test/estoque/motor-estoque-fase28c.test.ts` | `chaveIdempotencia`, `mensagemErroEstoque` (11 códigos + fallback), `EstoqueMotorError` (código, `isConflito`, `isPermissao`), conjuntos `EstoqueAcao` (9) e `EstoqueReferenciaTipo` (8), parâmetros da RPC canônica |
| `src/test/estoque/reserva-calc-fase28c.test.ts` | `fmtEmb`, `computeTotals`, `findInvalidIds`, `clampQty` (inclui invariante “nunca acima do máximo, nunca abaixo de 1”) |
| `src/test/estoque/catalogo-volumes-fase28c.test.ts` | `formatVolumeLabel`, `precoPorLitro`, `valorDose100ml`, `dosesPorVolume`, `formatPrecoLitro`, `formatDose100ml` + fórmulas congeladas por leitura estática |
| `src/test/estoque/estoque-contratos-fase28c.test.ts` | ausência de escrita direta em `estoque_produto`/`estoque_movimentacoes`, contrato do motor, chaves `entrega-expedicao`/`entrega-estorno`, antiduplo-clique, motivo mínimo, `reservaCalc` sem I/O, risco A1 congelado, ausência de migration nova, carrinho/catálogo intactos |

Os tipos `EstoqueAcao` e `EstoqueReferenciaTipo` não existem em runtime (são
uniões de tipo); foram congelados por leitura estática do arquivo, conforme
previsto no prompt.

## 3. Invariantes congeladas

1. `chaveIdempotencia` é determinística, junta com `:`, ignora `null`/`undefined`/`""` e preserva `0`.
2. `mensagemErroEstoque` traduz os 11 códigos `ESTQ_*` e devolve fallback com a mensagem original.
3. `EstoqueMotorError.codigo` extrai `ESTQ_[A-Z_]+` com padrão `ESTQ_ERRO`; classificação de conflito e permissão estável.
4. `EstoqueAcao` = exatamente 9 ações canônicas.
5. `EstoqueReferenciaTipo` = exatamente 8 tipos canônicos.
6. Chamada RPC preserva `p_acao`, `p_item_id`, `p_quantidade`, `p_idempotency_key`, `p_payload`.
7. `clampQty` nunca retorna valor `> max` nem `< 1`, preserva `""` e rejeita `max` inválido.
8. `findInvalidIds` rejeita vazio, NaN, `<= 0` e acima do disponível; aceita o limite exato.
9. `computeTotals` soma litros pró-rata `q * volume_total / quantidade` e ignora entradas inválidas.
10. `fmtEmb` estável para inteiro (`3× 1 L`), fracionário (`3× 0.33 L`), unidades (`3 un`) e vazio (`—`).
11. Conversões de volume: litros `= volume_ml/1000`; doses `= doses_por_volume ?? volume_ml/100`; dose 100 mL `= precoPorLitro/10`.
12. Escrita de estoque somente server-side: nenhum componente de estoque/cockpit/entregas escreve direto em `estoque_produto` ou `estoque_movimentacoes`.
13. `Entregas.tsx` mantém `operarEstoque` com as chaves `entrega-expedicao` e `entrega-estorno`.
14. Proteção de UI: `ReservarEstoqueDialog` mantém estado `submitting` ligado ao `disabled` do botão; `MotivoEmbalagemDialog` mantém `motivo.trim().length < 3`.
15. Nenhuma migration nova nesta frente (última = `20260905000000_hardening_digest_schema_v1.sql`).

## 4. Correções de lógica

**Nenhuma.** Todos os testes confirmaram o comportamento atual das funções puras
e dos contratos estáticos na primeira execução; nenhum bug de lógica pura foi
revelado. `reservaCalc.ts`, `motorEstoque.ts`, `useCatalogoVolumes.ts` e os
componentes permanecem byte-idênticos.

## 5. Riscos A1 e A2 — preservados para decisão humana

- **A1 — Duas vias de reserva.** `useEsteiraLaboratorio.ts` continua chamando
  `reservar_estoque_item` sem chave de idempotência. Não alterado nesta fase
  (troca por `rpc_estoque_operar_v1` exige decisão humana, migration e validação
  transacional). Congelado por teste para detectar mudança silenciosa.
- **A2 — Reserva item a item em laço.** `ReservarEstoqueDialog` mantém o laço
  sequencial com mitigação de UI (`submitting`). Não alterado.

Riscos médios/baixos M1–M3 e B1–B3 do relatório 28B seguem abertos; B1 (ausência
de testes do motor) foi **resolvido** por esta fase.

## 6. O que foi preservado

Banco, migrations, RLS, RPCs, Edge Functions, `src/integrations/supabase/client.ts`,
assinatura de `rpc_estoque_operar_v1`, `useCreatePartnerOrder`, `AddToCartDialog`,
`NovoPedido`, portal parceiro, portal produtor, catálogo, precificação, aprovação
técnica, cockpit, entregas e comprovante. Nenhum componente foi refatorado.

## 7. Validação executada

- `src/test/config/connection-binding.static.test.ts`: PASS (binding staging `ikaauvsflpmamgxmkhoq`).
- Typecheck (`tsgo --noEmit`): 0 erros.
- Teste 28B: PASS.
- Novos testes 28C (`src/test/estoque/`): PASS.
- Cockpit, entregas, catálogo e navegação: PASS.
- Suíte completa e build: ver resumo final desta fase.

## 8. Rollback

Esta fase adicionou apenas cinco arquivos:
- `src/test/estoque/motor-estoque-fase28c.test.ts`;
- `src/test/estoque/reserva-calc-fase28c.test.ts`;
- `src/test/estoque/catalogo-volumes-fase28c.test.ts`;
- `src/test/estoque/estoque-contratos-fase28c.test.ts`;
- `docs/auditorias/estoque-fase28c-blindagem.md`.

Rollback = remover esses cinco arquivos. `.env` e `src/integrations/supabase/types.ts`
foram restaurados ao baseline `c75bb87f`; nenhuma outra alteração de runtime.

## 9. Recomendação para a Fase 28D

Certificar a 28C por auditoria e teste, confirmar que as invariantes 1–15 seguem
congeladas, e registrar decisão humana explícita sobre A1 (idempotência da
reserva do cockpit) antes de qualquer frente que toque o motor de reserva.

## 10. Prompt pronto para a Fase 28D (NÃO executar nesta execução)

```text
FASE 28D — Certificação final da frente de estoque AR Bio

Auditar a Fase 28C aplicada no commit atual (docs/auditorias/estoque-fase28c-blindagem.md
e os quatro testes em src/test/estoque/*fase28c*). Só prosseguir se estiver íntegra.

Escopo: auditoria, teste de certificação e documentação. Nenhuma alteração
funcional, de banco, migration, RLS, RPC, Edge Function, carrinho, pedido B2B,
portais, precificação ou catálogo. Nenhuma biblioteca nova.

Confirmar:
- 28B CERTIFICADA registrada no relatório 28C;
- os quatro arquivos de teste 28C existem e passam;
- invariantes 1–15 da seção 3 do relatório 28C continuam congeladas;
- nenhuma correção de lógica foi introduzida sem documentação;
- riscos A1 e A2 seguem documentados e intactos;
- nenhuma migration nova na frente de estoque;
- cockpit, entregas, comprovante, carrinho e catálogo preservados;
- binding staging íntegro (baseline c75bb87f).

Criar src/test/estoque/estoque-fase28d-certificacao.test.ts e
docs/auditorias/estoque-fase28d-certificacao-final.md com status CERTIFICADA ou
NÃO APTA, decisão pendente sobre A1 e recomendação da frente seguinte.

Validar: connection-binding.static.test.ts, typecheck, testes de estoque, cockpit,
entregas, catálogo/navegação, suíte completa e build.
```

## 11. Status final

**FASE 28C APLICADA COM SUCESSO — MOTOR DE ESTOQUE BLINDADO POR TESTES E 28B CERTIFICADA.**

Nenhuma correção de lógica foi necessária. A Fase 28D não foi executada.
