# H9-A — Matriz de testes, checklist de promoção e prompt H9-B

Complemento de `00-h9a-inventario-e-plano.md`. **Somente documentação.** Produção `navfzbwgwzruipouyfnk`
permanece **NO-GO** e não foi acessada.

---

## 1. Sequência futura de promoção (nenhuma etapa executada nesta fase)

1. **Backup/PITR verificado** — confirmar backup recente do destino e restaurar amostra em ambiente descartável.
2. **Congelamento** — janela sem deploys, sem alteração de cron, sem escrita administrativa.
3. **Snapshot** — schema, ledger de migrations, policies (`pg_get_expr`), grants, funções, cron, Storage, config de Auth.
4. **Dry-run** — aplicar a fila de migrations em branch/cópia e comparar fingerprint estrutural (mesmo método de H7O/H8).
5. **Migrações idempotentes e ordenadas** — nenhuma das 59 repo-only entra; qualquer necessidade vira migration nova posterior a `20261003000000`.
6. **Testes por perfil** — matriz da seção 2, executada integralmente.
7. **Smoke fiscal** — leitura de readiness, `tpAmb` e transporte SEFAZ **sem emitir** em produção.
8. **Monitoramento** — `h8d-healthcheck.sh` na primeira hora, depois nas rotinas do runbook H8-D.
9. **Critérios de abortar** — qualquer erro de migration, qualquer negação de acesso incorreta, qualquer sinal CRITICAL do healthcheck, divergência de fingerprint ou falha de smoke fiscal.
10. **Rollback** — restaurar snapshot/PITR, reverter migrations pelo par forward/rollback nominal, revalidar healthcheck e matriz de acesso.

---

## 2. Matriz mínima de testes

Perfis: **Superadmin, Admin, Gestor, Comercial, Financeiro, Operador/Produção, Técnico/Consultor, Parceiro B2B,
Produtor, Cliente**. Cada perfil × desktop e mobile.

| # | Cenário | Aplicação | Aprovação |
|---|---|---|---|
| T1 | Fluxo feliz do domínio principal do perfil | Todos | Conclui sem erro e com dados corretos |
| T2 | Negação de acesso cruzado (ler/gravar dado de outro perfil/cliente) | Todos | Bloqueio server-side (RLS/RPC), não apenas UI |
| T3 | Duplicidade / idempotência (reenvio do mesmo comando) | Comercial, Financeiro, Operação, B2B | Nenhum registro duplicado |
| T4 | Concorrência (duas sessões na mesma OS/entrega/estoque) | Operação, Técnico, B2B | Lock consultivo resolve, sem estado inconsistente |
| T5 | Regressão dos fluxos H7/H8 (OS → produção → CQ → envase → entrega → comprovante; financeiro AR/AP; fiscal readiness) | Admin, Financeiro, Operação | Harnesses 300/300 e 136/136 PASS |
| T6 | Rotas públicas por token (comprovante e rastreio) | Anônimo | Token válido responde; token inválido nega; rate-limit ativo |
| T7 | Menu/navegação e cabeçalho por portal em mobile | Todos | Sem item indevido e sem quebra de layout |

---

## 3. Requisito futuro — exposição da Data/GraphQL API

Mudança de plataforma a considerar em toda nova tabela em `public`:

- **Não** presumir exposição automática à Data/GraphQL API.
- `GRANT` explícito por papel, na mesma migration do `CREATE TABLE`.
- `ENABLE ROW LEVEL SECURITY` + policies explícitas logo em seguida.
- Verificação pós-migration: consulta pela API como `anon` e como `authenticated`, confirmando o comportamento esperado (acesso ou negação).
- Tabelas fail-closed (sem policy) devem ficar **sem grant** e documentadas como tal.

---

## 4. Prompt independente para H9-B

```text
INICIE E CONCLUA A FASE H9-B — ONDA 2 DE REMEDIAÇÃO (SEGURANÇA CRÍTICA COMPROVADA).

CONTEXTO
- Projeto: AR Bio Manager. Staging ikaauvsflpmamgxmkhoq. Produção navfzbwgwzruipouyfnk PROIBIDA.
- Base documental: restoration/homologacao-h9/00-h9a-inventario-e-plano.md e 01-h9a-matriz-testes-e-promocao.md.
- Ledger 659, última migration 20261003000000. Cron jobid 5 ativo em "15 3 * * *".

TAREFA 0 (obrigatória, antes de tudo)
- Restaurar .env / client.ts / types.ts do baseline aprovado e fazer o binding gate passar em ikaauvsflpmamgxmkhoq.
- Advisor `rls_enabled_no_policy` = 10 = 7 tabelas `public` + 3 `private` (rate-limit interno); composição resolvida em H9-A, sem pendência.

ESCOPO PERMITIDO
1. Revisar o payload das duas RPCs SECURITY DEFINER executáveis por anon
   (rpc_validar_comprovante_entrega, rpc_validar_rastreio_produto), confirmando ausência de PII excedente
   e rate-limit ativo. Só alterar se houver exposição comprovada, com migration nova + rollback nominal.
2. Confirmar fail-closed das 10 tabelas com RLS sem policy (7 `public` + 3 `private`): 0 grants para anon/authenticated e 0 leituras
   bem-sucedidas por perfil não privilegiado.
3. Executar a matriz de testes T2 e T6 de H9-A.

TRAVAS
- Nada em produção. Nenhuma alteração em cron, Storage, Auth ou nas 59 migrations repo-only.
- Nenhuma revogação em massa de SECURITY DEFINER; onda 3 é outra fase.
- Não declarar GO para produção.

ENTREGA
- Relatório restoration/homologacao-h9/02-h9b-*.md, roadmap atualizado, guards/typecheck/build/Vitest,
  SHA final, arquivos alterados, evidências, riscos e pendências.
```
