# 27 — H7n-PROD: DIFF DE CONTRATOS E PACOTE VARIANTE PARA PRODUÇÃO

**Data:** 2026-09-10 (UTC-3)
**Alvo de destino:** produção `navfzbwgwzruipouyfnk`
**Execução por este ambiente:** nenhuma. Nenhum banco acessado, nenhum SQL
executado, nada publicado, nenhuma Edge Function implantada.
**Continuação de:** `26-h7n-auditoria-compatibilidade-producao.md`

---

## 1. O que foi feito

Diff objeto a objeto entre as 5 migrations H7n de staging e os contratos reais
de produção evidenciados pelo operador, seguido da geração de um pacote
versionado recortado **apenas** ao que tem dependência comprovada.

Resultado: das 5 unidades H7n, **1 item isolado** é promovível hoje. O resto
permanece **NO-GO**, por objeto ausente ou por falta de censo.

## 2. Veredito por unidade

| Unidade H7n | Veredito |
|---|---|
| P0 — `ALTER VIEW vw_os_integridade_esteira SET security_invoker` | **GO técnico** (onda A1), após dry-run |
| P0 — redefinir `vw_esteira_laboratorio` / `vw_fluxo_visita_tecnica` sobre `private.h7n_*` | **NO-GO** |
| P0 — views de catálogo + `fn_catalogo_preco_canonico(uuid,uuid,text,numeric)` | **NO-GO** — objetos ausentes |
| P1a — revokes de ~26 trigger functions | **NO-GO** — sem censo |
| P1b — guardas `42501` em RPCs (635 linhas) | **NO-GO** — risco de sobrescrever corpos divergentes |
| P1c — revokes de ~43 helpers internos | **NO-GO** — sem censo |
| P2 — `search_path` dos 4 helpers | **NO-GO** — funções ausentes |

Preservação exigida e respeitada: nenhuma rota, função ou grant existente em
produção é alterado pela onda A1.

## 3. Pacote gerado

Diretório `restoration/promocao-producao-h9/h7n-prod/`.

| Arquivo | Linhas | SHA-256 |
|---|---|---|
| `00-diff-contratos.md` | 116 | `70924eabeafffcc66ef1295f79c2b47efd2d62083f6a0b9c95c8cc7f1142b44e` |
| `10-plano-execucao-e-aceite.md` | 127 | `ac2d076d4a80317e6d61608b451f16714bb15d7cd0b3890fe2bb0077d5c46ebf` |
| `checks/00-censo-dependencias.sql` | 80 | `fbe3ea0f7a16e801fef7ca20a1cc12fabc3cedf61b1aab93471c95d88c6e1d5c` |
| `checks/01-prechecks.sql` | 44 | `30214e749769fdbdae7986e16903a487b04c82871b3a94f096e7ad98395b3fa6` |
| `checks/02-postchecks.sql` | 46 | `4262079d1115d1187536c47dc981e8630f59ead7dab427706c83b96d23cb0722` |
| `forward-sql/20261103000000_h7nprod_a1_security_invoker_views_v1.sql` | 132 | `7f9590eaaf8d66a0205153f48f4af393e51066da70570d793dcc2a81434405f7` |
| `rollback-sql/20261103000000_h7nprod_a1_rollback.sql` | 58 | `cf48300adb955308f84c4332d2a94043f063cf30f68c7b0205d41fc7ef6d49bc` |

Características do forward A1: guarda fail-closed por `promocao.target_ref`
(sandbox e alvo divergente abortam), precheck de existência/relkind, baseline de
ACL em tabela temporária, três `ALTER VIEW`, pós-check em transação exigindo 3/3
e ACL intacta, e **nenhuma** automarcação no ledger — o registro fica para o
runner, após os pós-checks externos.

O rollback é deliberadamente fail-closed: além da guarda de alvo exige
`promocao.rollback_autorizado='SIM'`, e reverte somente
`vw_os_integridade_esteira`, porque as outras duas já estavam endurecidas pela
P1 parcial e revertê-las reintroduziria a vulnerabilidade sem relação com a A1.

## 4. RLS, grants e testes por perfil

A onda A1 não emite `GRANT`, `REVOKE`, policy ou `ALTER TABLE`. O efeito é a
mudança de avaliação de privilégio nas três views, que passa a usar o usuário
consultante. Por isso o plano exige matriz de 10 perfis (`administrador`,
`gestor`, `administrativo`, `producao`, `financeiro`, `consultor_tecnico`,
`tecnico_agronomo`, `parceiro_b2b`, `cliente_produtor`, `anon`) com contagem
antes/depois em cada view, executada no dry-run de homologação. Perda de linhas
para perfil interno é motivo de parada — trata-se a policy da tabela-base, não
se reverte o hardening.

## 5. Critérios de aceite

Onze critérios objetivos em `h7n-prod/10-plano-execucao-e-aceite.md` §6, com
destaque para: `md5(pg_get_viewdef)` idêntico antes e depois (prova de que
nenhuma view foi redefinida), schema `private` ausente, contagem de 277
`SECURITY DEFINER` inalterada, Security Advisor com zero ERROR e ledger
493 → 494 apenas após os pós-checks.

## 6. Artefatos que faltam — bloqueiam A2 a A5

1. Saída arquivada, com SHA-256, de `checks/00-censo-dependencias.sql`
   executado em produção.
2. Diff `md5(pg_get_functiondef)` staging × produção de cada RPC do P1b.
3. Promoção prévia das ondas de schema que criam `fn_catalogo_preco_canonico`,
   as duas views de catálogo e os 4 helpers da P2.
4. Classificação dos 277 `SECURITY DEFINER` de produção em trigger / helper
   interno / RPC pública.
5. Evidência de dry-run verde em homologação para cada onda subsequente.

## 7. Gate

- **H7n-PROD onda A1:** preparada, **GO técnico** condicionado a dry-run em
  homologação, prechecks e backup confirmado. Nenhuma execução autorizada nesta
  etapa.
- **H7n-PROD ondas A2..A5:** **NO-GO**, com os artefatos faltantes listados
  acima.
- **Onda P2:** **permanece bloqueada.**
- Binding local em homologação `ikaauvsflpmamgxmkhoq`; sandbox proibido.
