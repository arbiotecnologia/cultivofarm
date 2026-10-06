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