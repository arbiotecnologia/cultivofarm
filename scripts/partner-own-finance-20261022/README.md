# Financeiro próprio — candidata INATIVA

## Achados LIVE somente leitura (agente,22/10)
Supabase externo canônico swzpzcwiasxmjutrmvkm validado pelo config antes das consultas. Snapshots funções/colunas/ACL/RLS/constraints preservados. As RPCs financeiras legadas () e(uuid) têm ACL somente postgres/service_role e estão corretamente fechadas: corpo SECURITY DEFINER seleciona partner_users apenas por user_id, sem revogação/vigência/tenant/role. NÃO reabrir esses corpos nem consumir página antiga inteira.

`accounts_receivable` é receita do fornecedor por pedido B2B; a projeção proposta representa **obrigação do parceiro perante o fornecedor**, não receita própria do parceiro, caixa/banco/custo/margem. O vínculo canônico é partner_orders→partner_order_financial_links→accounts_receivable(origin_type B2B_ORDER,origin_id pedido,partner_id exato,organization_id owner)→parcelas do título com organization_id owner. partner_orders e partner_order_financial_links não têm organization_id: não inventar coluna, comprovar tenant por partner→owner e título. Duplicidade/mismatch/null tenant parcela falham fechados por exclusão do título, sem reparar história.

Documentos possuem owner_type/owner_id polimórficos, sem FK desses owners. Owner RECEIVABLE pode apontar título, mas isso NÃO prova autorização de bytes nem pertinência de PAYMENT_RECEIVABLE/FINANCIAL_RECEIPT/FISCAL_INVOICE. RPC financial_document_download_snapshot depende de financial_storage_object_permitted e RLS; não alterar nem liberar por financeiro. Documentos permanecem FECHADOS neste recorte, sem path/URL/metadados/documentos inventados. Pendência explícita para inventário owner-specific e negativos reais.

## Implementação concreta
`candidate.sql.review`: overload versionada na **mesma RPC canônica** com wrapper INVOKER e core privado DEFINER (search_path vazio), gate singleton gestorB2B/cadeia scope aplicado+perfil/tenant/owner/vigência/papel+entitlements. Preserva assinaturas/OIDs/ACL legacy e scopeMD5c3f29977, nada de RLS ou grants de tabelas. Proposta conservadora exige recursos existentes pedidos_b2b e contas_receber (recebíveis canônicos do fornecedor) além de cadeia; isto não transforma gestor em financeiro interno. Mapeamento comercial dessa combinação precisa revisão independente, sem novo entitlement/fallback.
Paginação keyset50 títulos com ID remoto explícito; sem total global nem saldo fictício, sem alterações financeiras. Página Financeiro candidata reutiliza tabela/formatação e hook scoped canônico, retira MinhaSituacaoFinanceira, totalAberto errado sobre valor integral, CSV/documentos/mutations. Cada parcela mostra valor/pagamento registrado, sem chamar recebido pelo fornecedor de receita do parceiro. Frontend/runtime/menu/layout ainda NÃO promovidos.

## Ativação e rollback
1. Revisar preflight/hashes/ACL/owner/modelo explícito zero e entitlement. Guard transacional rejeita drift ou overload existente, não reaplica.
2. Auditor decide instalação; fazer REST real gestorA/gestorB/técnico/revogado/futuro/inativo/sem entitlement e títulos/parcelas nonempty autorizados. SQL sintético não certifica JWT/RLS.
3. Só então preparar capability financeira na projeção/menu/layout e map SaaS canônicos; NÃO remover commercialOwner inteiro nem inferir acesso por catálogo200. Página proposta não será acessível owner sem esse contrato coordenado.
4. Rollbackdeny revoga somente nova overload/core para authenticated, mantém legacy fechado; frontend volta a indisponível, não restaura grants. Nada de dados/objetos/roles/sessões/publicação automática.

Multipapel continua dependente de readers/provisioner/seletor/writersC2.1 coordenados. Ambiguidades/limites são blockers reais para promoção, não autorizações presumidas.