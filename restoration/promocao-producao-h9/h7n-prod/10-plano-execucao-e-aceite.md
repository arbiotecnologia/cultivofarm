# H7n-PROD — PLANO DE EXECUÇÃO, RLS/GRANTS, TESTES POR PERFIL E ACEITE

**Alvo:** produção `navfzbwgwzruipouyfnk`
**Homologação de ensaio:** `ikaauvsflpmamgxmkhoq`
**Sandbox `yzszlzjpovmcteuxjznj`:** proibido
**Estado desta etapa:** nenhum SQL executado, nada publicado, nenhum deploy.

---

## 1. Ondas

| Onda | Conteúdo | Estado |
|---|---|---|
| **A1** | `security_invoker=true` em `vw_os_integridade_esteira` + reafirmação nas 2 views já endurecidas | **preparada** — artefatos prontos, aguardando dry-run |
| A2 | redefinição de `vw_esteira_laboratorio` / `vw_fluxo_visita_tecnica` sobre `private.h7n_*` | **NO-GO** — depende do censo |
| A3 | views de catálogo + `fn_catalogo_preco_canonico` | **NO-GO** — objetos ausentes em produção |
| A4 | revokes de trigger/helper + guardas de RPC | **NO-GO** — depende do censo e do diff de corpos |
| A5 | `search_path` dos 4 helpers da P2 | **NO-GO** — funções ausentes |

Somente a A1 tem todas as dependências comprovadas. As demais ficam bloqueadas
por desenho até o censo `checks/00-censo-dependencias.sql` ser executado e
arquivado.

## 2. Artefatos da onda A1

| Papel | Caminho |
|---|---|
| Censo (leitura) | `checks/00-censo-dependencias.sql` |
| Prechecks | `checks/01-prechecks.sql` |
| Forward | `forward-sql/20261103000000_h7nprod_a1_security_invoker_views_v1.sql` |
| Pós-checks | `checks/02-postchecks.sql` |
| Rollback | `rollback-sql/20261103000000_h7nprod_a1_rollback.sql` |
| Diff de contratos | `00-diff-contratos.md` |

## 3. Sequência de execução (máquina do operador, canal autenticado)

1. **Dry-run em homologação.** `SET promocao.target_ref = 'ikaauvsflpmamgxmkhoq';`
   e rodar o forward com a guarda de alvo temporariamente ajustada em cópia
   local — **nunca** editando o artefato de produção. Confirmar 3/3 e ACLs
   idênticas. Sem dry-run verde, parar.
2. **Backup.** Confirmar restore point / backup lógico recente de produção.
3. **Censo.** Rodar `00-censo-dependencias.sql` em produção e arquivar a saída
   com SHA-256. Isso não é pré-requisito da A1, mas destrava A2..A5.
4. **Prechecks.** Rodar `01-prechecks.sql`. Exigir: banco `postgres`, ledger
   493 / `20261101000000`, version `20261103000000` ausente, 3 views presentes,
   2 de 3 já com `security_invoker`, objetos fora de escopo ausentes.
5. **Dry-run transacional em produção.** Rodar o forward inteiro trocando o
   `COMMIT` final por `ROLLBACK`. As guardas, prechecks e pós-checks internos
   executam de verdade; nada persiste. Só seguir se passar limpo.
6. **Aplicação.** Rodar o forward com `COMMIT`.
7. **Pós-checks.** Rodar `02-postchecks.sql`. Exigir 3/3, ACLs idênticas ao
   precheck E, `md5(pg_get_viewdef)` idêntico ao capturado antes (prova de que
   nenhuma view foi redefinida), schema `private` ausente, 277 `SECURITY
   DEFINER` inalterados.
8. **Security Advisor.** Reexecutar. Exigir **zero ERROR**; comparar o baseline
   0 errors / 304 warnings / 21 suggestions.
9. **Ledger.** Só depois disso: `supabase migration repair --status applied
   20261103000000` e inserir a linha em `public.promocao_execucao_registro`
   com o SHA-256 externo do arquivo. Nunca antes dos pós-checks.

## 4. RLS e grants

A onda A1 **não** altera RLS nem privilégios: nenhum `GRANT`, nenhum `REVOKE`,
nenhum `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`, nenhuma policy. O único
efeito é a flag `security_invoker` no `reloptions` das três views.

Consequência esperada e desejada: a partir da A1, a leitura das três views passa
a ser avaliada com os privilégios e as policies **do usuário que consulta**, e
não do dono da view. Quem já não tinha `SELECT` continua sem acesso; quem tinha
`SELECT` mas não passa pelas policies das tabelas-base deixa de ver linhas que
antes o `security_definer` implícito expunha. Esse é exatamente o defeito que a
onda corrige — e é por isso que os testes por perfil abaixo são obrigatórios.

`public.promocao_execucao_registro` e `public.promocao_rollback_baseline`
permanecem com RLS habilitada e zero policies (deny-by-default), como fixado na
P1.

## 5. Testes por perfil (obrigatórios, executar no dry-run de homologação)

Para cada perfil, autenticar e executar `SELECT count(*)` nas três views,
registrando resultado antes e depois:

| Perfil | `vw_os_integridade_esteira` | `vw_esteira_laboratorio` | `vw_fluxo_visita_tecnica` |
|---|---|---|---|
| `administrador` | acesso mantido, contagem igual | igual | igual |
| `gestor` | acesso mantido | igual | igual |
| `administrativo` | acesso mantido | igual | igual |
| `producao` | acesso mantido | igual | igual |
| `financeiro` | acesso mantido | igual | igual |
| `consultor_tecnico` | escopo do próprio cliente | escopo | escopo, inclui visitas próprias |
| `tecnico_agronomo` | escopo do próprio cliente | escopo | escopo |
| `parceiro_b2b` | sem acesso indevido | sem acesso indevido | sem acesso indevido |
| `cliente_produtor` | sem acesso indevido | sem acesso indevido | sem acesso indevido |
| `anon` | negado | negado | negado |

Qualquer perfil interno que **perca** linhas após a A1 indica que a policy da
tabela-base está mais estrita do que o contrato operacional — nesse caso, parar
e tratar a policy antes de promover, nunca reverter o `security_invoker`.

## 6. Critérios de aceite da onda A1

1. Dry-run em homologação verde, com a matriz de perfis registrada.
2. Prechecks conferem exatamente os valores esperados da seção 3.4.
3. Dry-run transacional em produção passa sem exceção.
4. Pós-check: 3/3 views com `security_invoker=true`.
5. ACLs idênticas antes e depois, view por view.
6. `md5(pg_get_viewdef)` idêntico antes e depois — nenhuma redefinição.
7. Schema `private` continua ausente em produção.
8. Contagem de `SECURITY DEFINER` executáveis por `authenticated` permanece 277.
9. Security Advisor com zero ERROR.
10. Ledger 493 → 494, latest `20261103000000`, com um registro `APLICADA` na
    onda `H7n-PROD-A1` e o SHA-256 externo correto.
11. Nenhum frontend publicado, nenhuma Edge Function implantada, nenhuma
    integração externa ativada.

Falha em qualquer item = não registrar o ledger e avaliar o rollback, que é
fail-closed e exige `promocao.rollback_autorizado='SIM'`.

## 7. Artefatos que ainda faltam (bloqueiam A2..A5)

1. Saída arquivada de `checks/00-censo-dependencias.sql` em produção.
2. Diff `md5(pg_get_functiondef)` staging × produção para cada RPC do P1b.
3. Promoção prévia de `fn_catalogo_preco_canonico`, das views de catálogo e dos
   4 helpers da P2.
4. Classificação dos 277 `SECURITY DEFINER` de produção em trigger / helper
   interno / RPC pública.
5. Evidência de dry-run verde em homologação para cada onda subsequente.
