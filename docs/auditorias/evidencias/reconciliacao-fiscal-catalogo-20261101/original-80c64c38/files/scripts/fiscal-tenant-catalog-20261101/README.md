# Perfil fiscal do catálogo próprio + cadastro de Fertilizante/Adubo — pacote revisável (NÃO APLICADO)

Status: **NO-GO para aplicação** até revisão independente, instalação da fundação de propriedade e prova JWT real.
Nada foi escrito no banco hosted, publicado ou liberado. Ref auditado (somente leitura): `swzpzcwiasxmjutrmvkm`.

## Auditoria read-only (01/11/2026)
- `produtos` NÃO tem `owner_organization_id`: o catálogo próprio por empresa não existe hoje no banco. A fundação está em `scripts/rbac-audit/proposed-tenant-catalog-ownership*.sql` (não instalada; gate próprio desligado).
- `product_fiscal_profiles`: 4 policies LIVE — leitura para Superadmin/administrador/gestor/financeiro de qualquer empresa; gravação só Superadmin; DELETE false.
  Depois que existirem itens próprios, isso deixaria uma empresa ler o perfil fiscal do item de outra. Este pacote corrige isso com policies RESTRICTIVE.
- `platform_create_global_product` (LIVE, Superadmin) aceita `tipo` do enum `tipo_produto` = inseticida, fungicida, solo, inoculante, solubilizador. Não existe tipo "fertilizante".
  O único fertilizante existente usa `tipo=solo` + `familia_catalogo=fertilizante_adubo`. A tela global hoje esconde o botão de criar fertilizante ("tipo e unidade próprios pendentes").

## O que o pacote contém
- `install.sql.review`: PRE fail-closed (exige a fundação, recusa reinstalação e divergência de policies); gate `owned_fiscal_gate` desligado; RPC `tenant_owned_product_fiscal_save` (ator real, empresa ativa, administrador/financeiro, nunca Superadmin, reautorização após cada lock, CAS `updated_at`, recibo idempotente, perfil sempre DRAFT, sem VALIDATED); leitor `tenant_owned_product_fiscal_list` (admin/financeiro/gestor da própria empresa); 3 policies RESTRICTIVE; **sem GRANT a authenticated** (etapa separada).
- `rollback.sql.review`: deny-only (gate false + REVOKE), mantém policies restritivas e recibos.
- Frontend candidato: `src/lib/fiscal/ownedProductFiscal.ts` com gate `OWNED_PRODUCT_FISCAL_ENABLED=false`, validação de campos, ACK exato e erros sem nova tentativa automática. Nenhuma tela foi ligada.

## Evidências (logs brutos em `evidence/`)
| Log | Resultado |
|---|---|
| pg-tests-run1..3.log.txt | FALHA de ambiente (initdb como root / usuário inexistente) — preservados |
| pg-tests-run4.log.txt | 25/25 PASS; caso anônimo não registrado (tabela de resultados sem GRANT a anon — erro do teste) |
| pg-tests-run5.log.txt | **26/26 PASS** + PRE sem fundação abortou + reinstalação recusada |
| vitest-owned-fiscal.log.txt | 16/16 PASS |
| typecheck.log.txt | `tsgo --noEmit -p tsconfig.app.json` exit 0 |

Casos PG: gate desligado nega; admin A cria DRAFT; replay idempotente sem duplicar; mesma chave/outro payload PT409; CAS ausente/errado PT409; CAS correto atualiza; NCM inválido e `profile_status` no payload 22023; A não grava item de B nem global pela RPC; A não insere direto; B não lê perfil de A e lista só os seus; B não reaproveita chave de A; gestor lê e não grava; Superadmin não grava/lê item próprio e continua gravando global; A lê global; ator inativo e anon negados; após rollback, negado e policies/recibos preservados.

Limites: esquema reduzido e Auth sintética (`test.uid`) em PostgreSQL descartável — **não** prova JWT/RLS/PostgREST hosted. O GRANT foi simulado só no banco descartável.

## Pendências / decisões do proprietário
1. Instalar e homologar antes a fundação de propriedade do catálogo (pacote rbac-audit) — pré-requisito.
2. **Fertilizante/Adubo**: decidir o `tipo` (reutilizar `solo`, como o item existente, ou criar um tipo novo — mudança irreversível no enum) e a unidade (kg/L; hoje a dose é só em mL/ha). Sem essa decisão, o botão de cadastro continua desligado no global e no próprio.
3. NCM/CFOP reais de cada item vêm da contabilidade; nada é preenchido automaticamente.
4. Validação autenticada (NÃO EXECUTADA): após instalação autorizada, testar com contas reais ARBio (positiva) e FSF (negativa), gestor somente leitura e Superadmin negado em itens próprios, com snapshots antes/depois e sem emissão, cobrança ou automação.
