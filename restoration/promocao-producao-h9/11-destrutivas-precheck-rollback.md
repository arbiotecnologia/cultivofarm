# P0b — As 15 migrations destrutivas, uma a uma

Nenhum SQL executado. A leitura distingue **efeito de topo** (roda quando a
migration é aplicada) de **`DELETE` no corpo de função** (só roda quando alguém
chama a função depois, sob RLS/ACL). Classificação da P0 era grosseira; esta é
por leitura do arquivo.

Contexto que muda o risco: a evidência independente mostra **produção sem dados
de negócio** (2 usuários, zero linhas operacionais, zero `storage.objects`).
Efeitos de limpeza de dados são, hoje, no-ops verificáveis.

| # | Version | Efeito real | Classe | Precheck | Rollback |
|---|---|---|---|---|---|
| 1 | `20260724000000` | `DELETE` apenas dentro de corpo de função | **NÃO DESTRUTIVA na aplicação** | contar linhas alvo (esperado 0) | forward: `CREATE OR REPLACE` da versão anterior |
| 2 | `20260727035330` | `DROP COLUMN data_referencia` condicional (só se for coluna gerada) seguido de re-criação | **DESTRUTIVA — condicional** | verificar `attgenerated` e contar não-nulos; se coluna não for gerada, o bloco não executa | restore point antes da onda; forward re-adiciona a coluna com backfill |
| 3 | `20260727161544` | limpeza de Vault dentro de função | **NÃO DESTRUTIVA na aplicação** | confirmar Vault disponível | forward |
| 4 | `20260727162402` | idem | **NÃO DESTRUTIVA na aplicação** | idem | forward |
| 5 | `20260727165826` | `REVOKE … TRUNCATE` (privilégio) | **NÃO DESTRUTIVA — é ACL** | listar grants atuais | `GRANT` de volta |
| 6 | `20260728031553` | limpeza de provider dentro de função | **NÃO DESTRUTIVA na aplicação** | — | forward |
| 7 | `20260728031714` | idem | **NÃO DESTRUTIVA na aplicação** | — | forward |
| 8 | `20260729024657` | substituição de parcelas dentro de função | **NÃO DESTRUTIVA na aplicação** | — | forward |
| 9 | `20260729034935` | `REVOKE … TRUNCATE` (privilégio) | **NÃO DESTRUTIVA — é ACL** | listar grants | `GRANT` de volta |
| 10 | `20260730030920` | `DROP TABLE IF EXISTS public._motor_b2b_fase7_proofs` | **DESTRUTIVA — tabela de provas** | a tabela não deve existir em produção; se existir, abortar e escalar | nenhum dado a restaurar; se existir, restore point |
| 11 | `20260803214628` | substituição de parcelas a receber dentro de função | **NÃO DESTRUTIVA na aplicação** | — | forward |
| 12 | `20260804000000` | `DROP COLUMN` aparece **apenas em comentário de rollback** | **FALSO POSITIVO da P0** | — | — |
| 13 | `20260804022556` | `DELETE FROM public.estoque_movimentacoes` de órfãos, **de topo** | **DESTRUTIVA — DML de topo** | `SELECT count(*)` do mesmo predicado; se > 0, abortar e escalar em vez de apagar | restore point antes da onda; sem PITR não há reversão de linhas |
| 14 | `20260804030304` | remoção de itens órfãos dentro de função | **NÃO DESTRUTIVA na aplicação** | — | forward |
| 15 | `20261014000000` | `DELETE` dentro de RPCs de exclusão segura | **NÃO DESTRUTIVA na aplicação** | — | forward |

Resumo: **3 destrutivas reais na aplicação** (`20260727035330`,
`20260730030920`, `20260804022556`), 1 falso positivo, 2 são só ACL, 9 são
lógica de runtime.

## Protocolo obrigatório para as 3 destrutivas reais

1. Restore point / backup comprovado imediatamente antes da onda que as contém.
2. `SET LOCAL lock_timeout = '5s'; SET LOCAL statement_timeout = '60s';`
3. Executar o precheck de contagem **na mesma transação**, antes do efeito.
4. **Contagem esperada é zero.** Qualquer linha encontrada aborta a transação e
   escala para decisão humana — a onda não segue. Não se apaga dado de produção
   dentro do preflight.
5. Postcheck: contagem final zero e objeto no formato esperado.
6. Falha em qualquer passo: `ROLLBACK`, onda interrompida, nada segue.

## Limitação declarada

Rollback é forward-only mais restore point. Para `DROP COLUMN` e
`DELETE` de topo, se houvesse dado, o único caminho de reversão seria
restore/PITR. Como **o backup diário não está comprovado**, essas três
permanecem **NO-GO** até prova humana de backup/PITR.


## Adendo P0c — provas de produção e retirada do blocker

Leitura autorizada somente-leitura em produção:

- `monitoramento_avisos.data_referencia` **não existe** → o `DROP COLUMN`
  condicional de `20260727035330` não é acionado no baseline atual;
- `public._motor_b2b_fase7_proofs` **não existe** → o `DROP TABLE` de
  `20260730030920` é no-op; se aparecer, o precheck aborta em vez de apagar;
- órfãos de `estoque_movimentacoes` contra `estoque_produto` = **0** → o
  `DELETE` de topo de `20260804022556` é no-op; qualquer linha encontrada no
  instante da onda aborta a transação antes de qualquer efeito.

As três passam a **PROMOVIVEL_CONDICIONADO**, com precheck fail-closed na mesma
transação, `lock_timeout='5s'`, `statement_timeout='60s'` e backup obrigatório.
O blocker técnico de reescrita está retirado; permanece apenas a exigência
humana de backup/restore point comprovado.
