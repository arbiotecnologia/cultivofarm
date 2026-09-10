# H7n-PROD — PLANO DE DRY-RUN EM HOMOLOGAÇÃO E GATES DE ACEITE

**Ambiente único do dry-run:** homologação `ikaauvsflpmamgxmkhoq`.
**Proibidos:** produção `navfzbwgwzruipouyfnk` e sandbox `yzszlzjpovmcteuxjznj`.
**Estado atual:** dry-run **NÃO EXECUTADO** — o Supabase de homologação exige **novo login autenticado**. Sem login renovado, nenhuma etapa abaixo pode ser iniciada.
**Este ambiente:** não executou SQL, não acessou banco, não publicou frontend, não implantou Edge Functions, não alterou produção.

---

## 1. Pré-condição de acesso (bloqueio ativo)

| Item | Estado |
|---|---|
| Sessão autenticada do Supabase de staging | **EXPIRADA — requer novo login** |
| Alvo confirmado como `ikaauvsflpmamgxmkhoq` antes de cada comando | pendente |
| Comportamento em caso de alvo divergente | **parar fail-closed, não executar** |

## 2. Sequência do dry-run (após o login)

| Etapa | Ação | Natureza | Interrompe se |
|---|---|---|---|
| D0 | Renovar login e confirmar project ref | — | ref ≠ `ikaauvsflpmamgxmkhoq` |
| D1 | Executar `01-prechecks-readonly-staging.sql` | somente leitura | qualquer consulta falhar |
| D2 | Arquivar a saída bruta com SHA-256 | arquivo | hash não gerado |
| D3 | Comparar a saída com o censo de produção de 2026-09-10 e preencher o checklist `00-checklist-dependencias-a2-a5-p2.md` | análise | item continuar não comprovado |
| D4 | Para cada onda cujo checklist ficar 100% comprovado: `BEGIN; <forward>; <pós-checks>; ROLLBACK;` | transacional, revertido | qualquer erro ou pós-check falho |
| D5 | Registrar tempo de execução, locks e avisos do D4 | evidência | — |
| D6 | Rodar a matriz de perfis em staging contra o estado pós-forward (em transação) | teste | qualquer perfil perder acesso legítimo |
| D7 | Security Advisor de staging antes × depois | leitura | surgir `error` novo |
| D8 | Emitir veredito por onda | documento | — |

Nenhuma etapa acima toca produção. O D4 é sempre revertido: o dry-run **nunca** deixa mudança persistida.

## 3. Prechecks somente leitura exigidos (resumo do D1)

1. Identidade: `current_database()`, `current_user`, versão.
2. Ledger: total e `latest` de `supabase_migrations.schema_migrations`.
3. Schema `private` e funções `private.h7n_*`.
4. Assinatura de `get_cliente_ids_for_user(uuid)`.
5. Rótulos do enum `app_role`.
6. Existência e colunas de `mv_esteira_laboratorio` e `mv_fluxo_visita_tecnica`.
7. Colunas e `security_invoker` das três views alvo.
8. Objetos dependentes das três views.
9. `fn_catalogo_preco_canonico`, `can_view_catalog_internal`, tipo `tipo_produto`, colunas `b2b_enabled`, views de catálogo.
10. `md5(pg_get_functiondef)` de todas as funções `public` (base do diff com produção).
11. Contagem e lista de `SECURITY DEFINER` com `EXECUTE` para `authenticated`.
12. Funções vinculadas a triggers (classificação).
13. Os quatro helpers da P2 e seu `search_path`.
14. RLS e contagem de policies das tabelas `public`.

## 4. Gates de aceite

Um gate só é considerado **APROVADO** com evidência bruta arquivada e SHA-256.

| # | Gate | Critério objetivo |
|---|---|---|
| G1 | Alvo correto | Todos os comandos comprovadamente contra `ikaauvsflpmamgxmkhoq` |
| G2 | Prechecks completos | 14 blocos do item 3 executados sem erro e arquivados |
| G3 | Ledger de staging estável | Total e `latest` idênticos antes e depois do dry-run |
| G4 | Zero escrita persistida | Toda transação do D4 encerrada em `ROLLBACK`; diff de schema antes × depois vazio |
| G5 | Diff de corpos | Todas as RPCs do P1b com `md5` comparado staging × produção, divergências listadas nominalmente |
| G6 | Classificação SECDEF | Os 277 `SECURITY DEFINER` de produção classificados em trigger / helper interno / RPC pública, sem "não classificado" |
| G7 | Dependências | Nenhum item do checklist A2..A5/P2 em estado `AUSENTE` ou `NÃO EVIDENCIADO` para a onda avaliada |
| G8 | Matriz de perfis | Todos os perfis mantêm os acessos legítimos e nenhum perfil ganha acesso novo |
| G9 | RLS e grants | Nenhuma tabela perde RLS; nenhum `GRANT` novo para `anon`; ACLs das views inalteradas |
| G10 | Security Advisor | Zero `errors` novos; qualquer `warning` novo justificado por escrito |
| G11 | Rollback | Script de rollback da onda executado com sucesso dentro do dry-run |
| G12 | Backup de produção | Restore point datado e comprovado antes de qualquer execução real futura |

## 5. Regra de promoção

- Onda com **todos** os gates aplicáveis aprovados → passa de `NO-GO` para `GO técnico condicionado`, ainda sem execução em produção.
- Onda com **qualquer** gate reprovado ou não executado → permanece `NO-GO`.
- Ausência de dry-run (situação atual, por login pendente) → **todas** as ondas A2..A5 permanecem `NO-GO` e a fase P2 permanece `BLOQUEADA`.
- A1 permanece `NO-OP / NÃO EXECUTADA` e **não é registrada no ledger**.

## 6. Veredito desta etapa

| Item | Veredito |
|---|---|
| Pacote de dry-run e checklist | **PREPARADO** |
| Dry-run em homologação | **NÃO EXECUTADO** — login de staging pendente |
| A2, A3, A4, A5 | **NO-GO** |
| Fase P2 | **BLOQUEADA** |
| Promoção em produção | **NO-GO** |
