# Promoção Controlada Staging → Produção — Fases P0/P1

Data da medição: 2026-09 (sessão corrente).
Alvo auditado: staging `ikaauvsflpmamgxmkhoq` (marcador `STAGING`, `production_emission_allowed=false`).
Produção `navfzbwgwzruipouyfnk`: **não acessada**. Nenhum DDL/DML de promoção executado.

## 1. Escopo executado

| Item | Situação |
|---|---|
| Inventário estrutural do staging | OK — contrato em `restoration/promocao-producao/expected/` |
| Inventário de migrations e reconciliação com o ledger | OK |
| Classificação do delta de promoção | OK — `restoration/promocao-producao/manifest.md` |
| Plano de dados (mestre × transacional × auditoria) | OK — `data-manifest.md` |
| Plano de Auth e Storage | OK — `data-manifest.md` |
| Diff real produção × staging | **BLOQUEADO** — sem `PROD_DSN` neste ambiente |
| Dry-run do delta | Executado; interrompido por migration one-shot (§4) |
| Backup/PITR de produção | **NÃO CONFIRMADO** |

## 2. Números do staging

225 tabelas (100% com RLS), 543 políticas, 954 funções (647 `SECURITY DEFINER`),
316 triggers, 888 índices, 384 FKs, 24 views, 2 matviews, 57 enums, 8 extensões,
18 usuários Auth, 14 buckets (13 privados), 29 objetos em Storage.

Migrations: 702 arquivos no repositório; 644 versões no ledger; **0 órfãs**
(nenhuma versão aplicada sem arquivo); 58 arquivos sem registro no ledger.

## 3. Achados

### P0-01 — 20 migrations de sandbox dentro de `supabase/migrations`
Arquivos `20260812134101…20260812135640` com nome UUID vêm da restauração do backend
sandbox acidental (`yzszl…`). O primeiro cria `app_role` com `('admin','moderator','user')`,
enquanto o enum canônico tem 13 rótulos, e recria `public.user_roles`. Aplicados em
produção, destruiriam papéis e acessos. Ação: quarentena antes de qualquer promoção.

### P1-02 — Ledger do staging não reproduz o estado real
O ledger para em `20260823000000`; as 38 migrations seguintes foram aplicadas fora de
banda pelos runners de `restoration/`. A fonte de verdade da promoção é a lista ordenada
de arquivos (manifest §1), não o ledger. Reconciliar o ledger antes de P2.

### P1-03 — Dados do staging são sintéticos
10 das 11 linhas de `clientes` são resíduo `H6B-…`; toda a cadeia transacional
(pedidos, entregas, financeiro, estoque) é massa de homologação. Somente dados
mestres/fiscais/configuração são candidatos a promoção.

### P1-04 — Delta parcialmente one-shot
`20260823000000_fase_f4_1_xsd_oficial` falha na reexecução com
`FISCAL_XSD_REGISTRY_IMMUTABLE` (por desenho). O ensaio válido exige banco temporário
restaurado do baseline de produção.

### P1-05 — Usuários e objetos de homologação em Auth/Storage
4 usuários `@arbio-staging.test` sem perfil/papel e 9 usuários `@arbio.com` sem
identidade Auth (criados por harness). 27 objetos em `consultor-arquivos` e 2 XML de
`tpAmb=2` em `fiscal-xml` — nenhum deve ir para produção.

### P1-06 — Marcador fiscal e séries
`fiscal_environment_marker`, `_fiscal_staging_marker`, `company_fiscal_settings`,
`fiscal_document_series` e `codigo_sequencias` são específicos de ambiente: promover
estrutura, reconfigurar valores; numeração fiscal reinicia em produção.

## 4. Resultado do dry-run

`30-dry-run-staging.sh` — delta de 42 migrations, transação com `ROLLBACK` garantido.
As três primeiras migrations reaplicaram sem erro (grants, políticas, funções, revokes);
a quarta abortou pela imutabilidade do registro XSD. Nada foi persistido.

## 5. Pré-condições para a fase P2

1. Autorização humana explícita e janela aprovada.
2. PITR/backup de produção confirmado por escrito.
3. `PROD_DSN` fornecido por humano e execução de
   `10-inventario-readonly.sh` + `20-diff-expected.sh` para o diff real.
4. Quarentena dos 20 arquivos de sandbox (P0-01).
5. Reconciliação do ledger do staging (P1-02).
6. Ensaio do delta em banco temporário a partir do baseline (P1-04).
7. Releases H7e/H7k implantadas pelo pipeline oficial.
8. Produção fiscal permanece bloqueada: `tpAmb` de produção só após gate fiscal próprio.
