# Pós-D52 — Prova comercial positiva e fundação de pagamentos

## 1. Nome

Fase 2 — fluxo comercial revisável e fundação não operacional de pagamentos — 2026-10-06.

## 2. Objetivo

Preparar versões comerciais com revisão antes da publicação e estruturar pagamentos sem habilitar cobrança, credenciais, checkout ou integrações externas.

## 3. Diagnóstico vivo

- Supabase canônico confirmado: `swzpzcwiasxmjutrmvkm`.
- Permanecem **zero versões comerciais**, zero eventos de pagamento e zero itens de saída de pagamento.
- Não foram criados planos, preços, limites, assinaturas, tenants ou usuários.
- A prova positiva `ACTIVE/TRIAL` versionada continua bloqueada por ausência deliberada de dados comerciais reais.

## 4. Estrutura comercial

`saas_plan_versions` passou a distinguir `DRAFT`, `PUBLISHED` e `ARCHIVED`, com período de teste, revisão, chaves idempotentes e dados de arquivamento. `saas_plan_version_audit` registra estado anterior/novo, motivo, origem, ator e chave idempotente. A composição detalhada continua em `saas_plan_version_features`; não foi criado catálogo paralelo.

## 5. Regras comerciais

- Rascunhos aceitam preenchimento progressivo, sem conceder funcionalidades.
- Publicação exige preço não negativo, moeda de três letras, ciclo permitido, período de teste de 1 a 365 dias, objeto de limites, ao menos uma funcionalidade do plano, vigência, motivo e confirmação `PUBLICAR`.
- Publicação concorrente é serializada; chaves idempotentes evitam repetição.
- Somente `PUBLISHED` pode ser vinculada a assinatura.
- Um novo `TRIAL` versionado recebe, no servidor, o período definido na versão publicada.
- `PUBLISHED` é imutável; arquivamento não apaga histórico e é recusado quando há assinatura corrente.

## 6. Fluxo implementado

O painel Plataforma permite selecionar plano, preencher os dados comerciais reais, escolher funcionalidades existentes, salvar rascunho e publicar após checklist completo e confirmação forte. As RPCs `platform_save_plan_version_draft`, `platform_validate_plan_version_draft`, `platform_publish_plan_version_draft` e `platform_archive_plan_version` concentram as decisões no servidor. O antigo caminho de publicação direta perdeu permissão para usuários autenticados.

## 7. Permissões e RLS

- RPCs comerciais são `SECURITY INVOKER`, `search_path` vazio e exigem `public.is_platform_superadmin(auth.uid())`.
- Escritas nas tabelas exigem policies de Platform Superadmin e tickets transacionais; chamadas diretas sem ticket são bloqueadas por gatilho.
- RPCs internas de pagamentos são `SECURITY DEFINER`, `search_path` vazio, sem execução por `PUBLIC`, `anon` ou `authenticated`, e acessíveis somente por `service_role`.
- Todas as novas tabelas receberam grants explícitos, RLS e policies apenas para `service_role`.

## 8. Impactos

Assinaturas legadas permanecem intactas e fail-closed. Nenhuma assinatura foi vinculada, migrada ou alterada. D51.6 não foi reaberta. Publicar o aplicativo continua distinto de publicar uma versão comercial.

## 9. Performance

Foram criados índices para estado/vigência, chaves idempotentes, uma única versão DRAFT por plano, busca de eventos por agregado/ordem, retentativas, saída e achados de reconciliação. Consultas do painel mantêm limite defensivo.

## 10. Auditoria

Versões registram criação, edição, publicação e arquivamento com valores anterior/novo. A auditoria é append-only. Eventos de pagamento possuem unicidade por provedor/ambiente/identificador, hash do conteúdo, estado de assinatura, ordem, tentativas e trilha append-only.

## 11. UI/UX

A aba Planos agora mostra rascunhos, publicadas e arquivadas, campos pendentes, estados de envio e confirmação explícita. O duplo clique é bloqueado durante o envio e a mesma chave é reutilizada enquanto a tentativa não termina; só após sucesso é gerada outra chave.

## 12. Fundação de pagamentos

Foram adicionados contratos tipados e adaptador mock sem rede, clientes/contratos internos, eventos idempotentes, saída retida, auditoria, reconciliação e retentativa/dead-letter. A função de claim devolve zero linhas por desenho. A flag `saasPaymentsOperational` permanece `false`. Não existe endpoint público funcional, segredo, checkout, PIX, boleto, cartão, webhook externo ou chamada de provedor.

## 13. Mercado Pago x Stripe

A comparação fica como ADR pendente. A documentação oficial consultada confirma que ambos oferecem APIs e notificações de eventos, mas a elegibilidade exata por conta, produto e contrato precisa ser homologada. Para a conta brasileira devem ser confirmados: PIX, boleto, cartão, parcelamento, recorrência, prazo de liquidação, taxas, estorno/disputa, conciliação, SLA e responsabilidades fiscais.

Fontes oficiais consultadas em 2026-10-06:

- Stripe Brasil — preços: <https://stripe.com/br/pricing>
- Stripe — métodos locais: <https://stripe.com/br/pricing/local-payment-methods>
- Stripe — tipos de eventos: <https://docs.stripe.com/api/events/types>
- Stripe — disputas: <https://docs.stripe.com/api/disputes>
- Mercado Pago Developers — notificações de chargeback: <https://www.mercadopago.com.br/developers/pt/docs/checkout-pro/chargebacks/notifications>
- Mercado Pago Developers — gestão de chargeback: <https://www.mercadopago.com.br/developers/pt/docs/checkout-pro/chargebacks/manage>
- Mercado Pago — custos de venda online: <https://www.mercadopago.com.br/blog/quanto-custa-vender-on-line-com-mercado-pago>

Nenhuma taxa foi codificada ou tomada como premissa porque valores, liquidação e disponibilidade podem variar. A escolha final exige proposta comercial, validação jurídica/fiscal e teste em ambiente do provedor.

## 14. Critérios de aceite

- [x] DRAFT revisável, validação server-side e publicação idempotente.
- [x] Publicada imutável, arquivamento histórico e proteção concorrente.
- [x] UI integrada ao painel existente sem valores inventados.
- [x] Fundação provider-agnostic, mock determinístico e cobrança desligada.
- [x] Nenhum dado comercial ou financeiro criado.
- [ ] Prova comercial positiva com versão e assinatura reais.

## 15. Testes e evidências

- 13 testes focados D52/fundação: PASS.
- Typecheck: PASS.
- Lint focado: PASS após correção do aviso de dependências.
- Scanner de segredos: PASS.
- Build automático da prévia: PASS após as alterações finais.
- Estado vivo: 0 versões, 0 eventos, 0 itens de saída; nenhuma mutação comercial.
- Privilégios vivos das RPCs: comerciais somente autenticado com validação server-side; internas de pagamento somente `service_role`.
- O linter do Supabase ainda reporta 467 achados globais preexistentes, fora do escopo desta entrega; nenhum foi introduzido pela proteção final.

## 16. Rollback e forward-fix

Rollback operacional: manter a flag OFF, não publicar rascunhos e não executar workers; isso preserva todos os dados e torna a fundação inerte. Como as migrations já estão aplicadas ao banco canônico, qualquer correção deve ser forward-only. Não remover colunas, tabelas, versões ou auditoria. Em falha na UI, retirar apenas sua exposição e manter o histórico. Em falha de regra, substituir função/gatilho por migration corretiva idempotente.

### Arquivos e migrations alterados

- `src/components/plataforma/VersaoComercialEditor.tsx`
- `src/hooks/usePlataformaSaaS.ts`
- `src/pages/plataforma/PlataformaHome.tsx`
- `src/pages/plataforma/PlataformaGestao.tsx`
- `src/config/featureFlags.ts`
- `src/lib/payments/contracts.ts`
- `src/lib/payments/mockAdapter.ts`
- `src/test/saas/pos-d52-commercial-payment-foundation.test.ts`
- `AGENTS.md`, `roadmap.md` e este relatório
- `20261006014659_82dce7db-5ec7-420a-9c29-4631c866fa56.sql`
- `20261006014722_e6503c9b-09d9-4839-bdaa-d5e32c37403f.sql`
- `20261006014826_8efb5553-59b0-432f-b734-decdc5c18314.sql`
- `20261006014937_360eada3-fc19-4971-ae72-bc65fb10a1cf.sql`

Dados mínimos ainda necessários: plano alvo, preço, moeda, ciclo, dias de teste, limites, funcionalidades, início de vigência e motivo de publicação — todos reais e confirmados pelo proprietário.

## 17. Decisão final

- **Fluxo de publicação comercial:** IMPLEMENTED/READY estruturalmente; nenhuma versão publicada.
- **Prova comercial positiva:** BLOCKED/NO-GO até entrada comercial real e homologação autenticada.
- **Fundação de pagamentos:** FOUNDATION READY, testada e deliberadamente não operacional.
- **Cobrança real:** OFF/NO-GO.
- **Próxima fase do produto:** NÃO INICIADA.

Próxima ação mínima: o Platform Superadmin preencher e revisar os dados comerciais reais. Somente após sua publicação explícita poderá ser executada a prova positiva autenticada, sem criar fixtures.
## 18. Execução da prova comercial positiva A/B/C — 2026-10-07 (~03:42 UTC)

Executada no Supabase canônico `swzpzcwiasxmjutrmvkm` pelo roteiro `supabase/tests/prova-comercial-positiva/01-abc-rollback.sql`, em bloco único encerrado por `RAISE EXCEPTION` (rollback integral). Sem migration, sem alteração de regras, preço, cobrança ou enforcement e sem publicação do app.

### Versão comercial (consulta direta)
- `713b1a31-ed4c-48b6-b6e7-22ebd3ee1092` — Plano Base v1, `PUBLISHED`, `effective_from` 2026-10-07 03:13 UTC, 59,90 BRL, `monthly`, 14 dias de trial; 3 features no snapshot (fichas_tecnicas, recomendacoes_alertas, visitas_tecnicas); `limits_snapshot` vazio.
- Observação: `effective_to` = 2026-10-09 00:58 UTC (fim de vigência já registrado; não alterado nesta rodada).

### Resultados (todos PASS, salvo indicação)
- Fixtures A/B/C (3 organizações, 2 parceiros) criadas e revertidas; resíduos pós-execução = 0 (organizações, parceiros, histórico/overrides órfãos, marcação em `saas_features`). Os 7 perfis de teste reutilizados conferidos no estado original (organização, ativo, papéis, `partner_users`).
- Idempotência: retry com mesma correlação → mesmo id, 1 assinatura, 1 histórico; segundo trial com outra chave negado; override com mesma chave → mesmo id; mesma chave com payload divergente negada.
- Entitlements em trial: administrador, financeiro, gestor_comercial e técnico de A = `trial_active` com as 3 features; usuário inativo = `no_context`; B sem assinatura = `no_subscription`; assinatura legada sem versão recusada; parceiro_b2b de C = features com override aplicado.
- Isolamento: cada perfil vê apenas a própria assinatura; catálogo do parceiro C acessível só a C (34 itens) e ao Superadmin; nenhum perfil de A acessa catálogo/simulação de C; preços técnicos visíveis = 0.
- Forja: troca de `organization_id` próprio negada; override próprio negado; troca de `partner_account_id` negada; eventos de pagamento visíveis = 0.
- Visitante (anon): contexto, catálogo e assinaturas negados.
- Imutabilidade: UPDATE na versão publicada e DELETE das features negados; hashes da versão/features e snapshot da assinatura idênticos após alterar o catálogo global.
- Pagamentos: eventos/outbox/auditoria 0/0/0 antes e depois.

### Não provado
- **Assinatura ACTIVE: NÃO PROVADA.** Não existe fluxo oficial de transição trial→active; a tentativa direta na transação foi bloqueada (`uq_org_sub_history_correlation`) e a assinatura permaneceu `TRIAL`.

### Comportamento a confirmar (não classificado como falha)
- Simulação de preço do próprio parceiro (A) permitida a administrador, financeiro e gestor_comercial de A; negada ao técnico (`not_authorized`). Nenhum desses perfis abre o catálogo de A.

### Comandos desta rodada
- Vitest suíte completa: 384 arquivos PASS + 1 skipped; 5.568 testes PASS + 4 skipped.
- Vitest focado SaaS + Comunicação: 56/56 arquivos, 799/799 testes.
- Vitest focado segurança/RBAC/guards multiportal: 31/31 arquivos, 356/356 testes.
- Typecheck (`tsc --noEmit -p tsconfig.app.json`): exit 0.
- Lint focal (saas, plataforma, usePlataformaSaaS, lib/saas): exit 0. Lint global (`eslint .`): exit 1, 3.604 problemas (3.477 erros, 127 avisos) preexistentes, não tratados.
- Build (`vite build`): exit 0 (apenas aviso de tamanho de chunk).
- Scanner de segredos (`scripts/fiscal-secrets-scan.sh`): OK, nenhum valor secreto real.

### Advisors Supabase (informados em 2026-10-07; não corrigidos — dívida preexistente e risco de produção)
- Segurança: 17 tabelas com RLS sem policy (INFO); 2 funções SECURITY DEFINER executáveis por anon (WARN); 445 executáveis por authenticated (WARN); proteção contra senhas vazadas desativada (1 WARN).
- Performance: 166 FKs sem índice (INFO); 36 auth RLS initplan (WARN); 1 tabela sem PK (INFO); 371 índices não usados (INFO); 127 políticas permissivas múltiplas (WARN).

### Decisão
- **NO-GO** para considerar a prova comercial positiva totalmente fechada: falta fluxo oficial trial→active.
- **GO** apenas para isolamento, entitlements em trial, imutabilidade de versão/snapshot e ausência de pagamentos.
