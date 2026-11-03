# Roteiro de aplicação — catálogo próprio + perfis fiscais (NÃO EXECUTADO)

Opção A escolhida pelo proprietário em 2026-11-01: o assistente apenas lê e prepara; o auditor revisa e executa.

## Pré-condição obrigatória
- Ref do projeto: `swzpzcwiasxmjutrmvkm` (conferir no SQL Editor antes de tudo; divergente = parar).

## Estado lido em produção (somente leitura, 2026-11-01 13:40 UTC)
| Item | Valor |
|---|---|
| `produtos.owner_organization_id` | ausente |
| `catalog_ownership_enabled()` / `tenant_owned_product_fiscal_save` | ausentes |
| produtos | 13 |
| `product_fiscal_profiles` | 2 |
| enum `tipo_produto` | fungicida, inoculante, inseticida, solo, solubilizador (Fertilizante/Adubo reutiliza `solo`; nenhuma alteração de enum) |

## Ordem de aplicação
1. Snapshot PRE: contagens de `produtos`, `product_fiscal_profiles`, ACL e políticas de ambas.
2. Fundação de propriedade, na ordem de `scripts/rbac-audit/ownership-ordered-manifest.json`:
   `proposed-tenant-catalog-ownership.sql`, depois `-02` … `-13`. Rollback: `rollback-tenant-catalog-ownership.sql`.
   Revisar antes os testes `runtime-test-tenant-catalog-ownership*.sql` em banco descartável.
3. Conferir: coluna `owner_organization_id` presente, produtos existentes continuam globais (NULL), gate desligado.
4. Catálogo fiscal por empresa: `scripts/fiscal-tenant-catalog-20261101/install.sql.review` (o PRE aborta se o passo 2 faltar). Rollback: `rollback.sql.review` (só nega).
5. Snapshot POST: mesmas contagens (13 / 2 esperados, sem perda), gates `false`, sem GRANT novo a `anon`.
6. Somente após revisão: ligar gates e conceder EXECUTE, em etapa separada autorizada.
7. Validação autenticada real: empresa A (ARBio) cria/edita item próprio; empresa B (FSF) não vê nem altera; Superadmin não escreve em item de empresa.

## Fora do escopo
NF-e continua desativada; NCM/CFOP vêm da contabilidade; sem cobrança, automação ou publicação.

## Status
NO-GO até revisão independente e execução pelo auditor.

## Etapa 1 — tentativa 2026-11-01 13:51 UTC (proprietário dispensou revisão independente)
- Ref conferido em .env/client/config: `swzpzcwiasxmjutrmvkm`. Hashes dos 12 arquivos = manifesto (OK).
- PRE (read-only): produtos 13, microrganismos 25, culturas 8, formulacoes 26, catalogo_volumes 5, product_fiscal_profiles 2, políticas 29, grants anon/authenticated nas 5 tabelas: nenhum, owner_organization_id ausente, catalog_tenant_actor presente, gate ausente.
- NÃO APLICADO: a ferramenta de migration não lê arquivos; os 12 arquivos (~290 KB) exigiriam transcrição manual, com risco de divergência dos hashes. Aplicar no SQL Editor, na ordem do manifesto, cada arquivo íntegro.
