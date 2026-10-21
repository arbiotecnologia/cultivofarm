# Candidata B2B separada — especificação revisável, NÃO executável

## Achado LIVE read-only (Supabase swzpzcwiasxmjutrmvkm)
- `get_partner_catalog_secure(uuid)` MD5 `4c8798e1567434a25b3fa9c9052f8759` e `get_partner_catalog_tecnico_secure()` MD5 `f1b68ffa8664b2655225eb298140860b`: retornos TABLE não contêm `familia_catalogo`. Ambas enumeram ativos+B2B, sem aplicar `catalog_tenant_visibility` nas bases produto/microrganismo.
- Gestor: `b2b_actor_scope`, empresa vinculada ao parceiro, perfil/vínculo ativo, feature, `partner_users`; técnico presente nega termos financeiros mesmo cumulativo. Preservar essas negativas (C2 separado).
- Técnico: exige perfil/partner válido/feature; ficha aprovada; preços ocultos para técnico. Nada neste pacote deve ampliar campos financeiros.
- `catalog_tenant_actor('read_prefs')` deriva tenant ativo do ator via h15, não resolve a empresa fornecedora do vínculo comercial. Não passar tenant escolhido pelo navegador nem presumir que tenant parceiro equivale ao fornecedor.
- B2B fichas usa leitura direta com RLS ativo+B2B/ficha aprovada e caches sem ator/tenant; grade de NovoPedido usa leitor compartilhado `scope=b2b`, enquanto slots de preço/carrinho usam RPCs de parceiro. Não substituir pela fonte interna nem introduzir enriquecimento paralelo por IDs.

## Preflight obrigatório antes de produzir SQL de migração
1. Comprovar ref canônico, identidade/tenant ativo, matriz de parceiro fornecedor/revenda, autoridade de ocultação e tenant cuja preferência prevalece. Esta decisão NÃO está comprovada; gate fechado.
2. Snapshot completo de definição/assinatura/ACL/dependências das duas RPCs e resolutores de parceiro/preço. Os MD5 acima devem conferir; divergência interrompe, sem overwrite de definição nova.
3. Inventariar consumidores e dependências SQL dos retornos TABLE; adicionar coluna não pode ser feito via CREATE OR REPLACE sem plano para mudança de retorno. Preservar assinaturas públicas canônicas e contratos existentes; sem tabela/RPC de catálogo paralelo.
4. Reusar resolvedor canônico de parceiro/tenant e tabela de visibilidade existente na mesma consulta; não ampliar RLS/ACL nem usar filtro client-side como autoridade.
5. Testar JWT/RLS reais A/B: gestor/técnico/comercial, tenant divergente, perfil inativo, revogação, feature negada, itens ocultos/inativos, ficha não aprovada, família NULL, preços técnicos e histórico. Transações sintéticas não equivalem à homologação.

## Alteração planejada (não implementada)
Somente após o preflight: adicionar metadado explícito da família aos retornos canônicos, filtrar NOVAS seleções pela visibilidade do tenant comprovado, preservar preços/fichas/roles/negativas, adaptar leitores existentes e chaves ator/tenant. Químicos/adubos não ganham encaminhamento fabril.

## Rollback / gate
Sem implantação, o rollback atual é **nenhuma operação de banco**. Para uma futura migração aprovada: preservar snapshot byte-exato das definições/ACL existentes, validar dependências e reverter somente o delta de família; não remover filtro de visibilidade para reabrir exposição. Se reversão reabrir acesso, desativar o novo consumidor e manter negativa até forward-fix auditado. Nenhuma destruição de catálogo/histórico.

Não há DDL/DML/Edge executável neste pacote: a alçada de visibilidade B2B ainda exige prova. Não implantar, publicar ou criar dados para fazer as novas famílias aparecerem.