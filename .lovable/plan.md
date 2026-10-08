# Provisionamento B2B integrado — mesma auditoria AR Bio

## Diagnóstico confirmado
- A ausência do perfil não é apenas visual: Configurações exclui os dois perfis B2B; `create-user` aceita somente os dez papéis internos e rejeita vínculos.
- `usePartnerUsers` bloqueia todas as mutações, a aba mantém Vincular desabilitado e a RPC viva `link_partner_user` nega antes de qualquer efeito. A política de `partner_users` permite apenas leitura administrativa escopada; não há escrita autenticada autorizada.
- O acesso ao portal deriva `organizations.partner_account_id` e exige um único vínculo coincidente. Esse contrato não equivale ao proprietário comercial `partner_accounts.commercial_owner_organization_id`. Liberar um usuário AR Bio ligado a terceiro comercial não estabelece um contexto B2B seguro.
- O formulário transforma a razão social vazia em `null` antes da validação, explicando o erro técnico relatado. O CNPJ repetido permanece inválido.

## Recorte mínimo a preparar
1. Corrigir a validação de razão social obrigatória no formulário existente, preservando valores opcionais nulos e a rejeição de CNPJ inválido; adicionar testes comportamentais sem escrita remota.
2. Documentar a matriz integrada administrador→owner comercial→parceiro→tenant do usuário→perfil→papel→vínculo→primeiro acesso→contexto do portal. Separar operação interna A de identidade própria P, sem mandato ou equivalência inferida.
3. Preparar casos executáveis locais para o contrato proposto: parceiro próprio, parceiro alheio/órfão/inativo, usuário alheio/inativo, papel extra, vínculo duplicado, sessão antiga, plano ausente, cancelamento e falha parcial. Testes de proposta não serão apresentados como validação do servidor vivo.
4. Manter dropdown, mutações e ACL fechados enquanto o resolver do portal, a autorização de provisionamento e o primeiro acesso não suportarem a mesma cadeia comprovada. Não acrescentar B2B à allowlist de `create-user` nem alterar `organizations.partner_account_id` para contornar o bloqueio.
5. Atualizar relatório, evidências e roadmap com o caminho necessário para restauração integrada e os gates restantes para as fixtures AR Bio e faturamento interno.

## Limite de implementação
O contrato atual não sustenta a ativação segura do provisionamento B2B solicitado. Este recorte prepara a correção e resolve a validação focal; não cria contas, credenciais, convites, vínculos ou fixtures persistidas. Uma implementação server-side posterior só poderá reutilizar o fluxo existente após fechar autorização de ator/tenant, compensação ou atomicidade, idempotência, papel único protegido e definição de senha pelo titular. Não será criado um fluxo paralelo ou acesso cross-tenant.

## Detalhes técnicos e verificação
- Usar somente o cliente canônico `swzpzcwiasxmjutrmvkm`; nenhuma migration, grant ou Edge alterada neste recorte preparatório.
- Conferir triggers de vínculo e impacto em validade de sessão; conservar fencing de respostas e caches.
- Rodar testes focais existentes de usuários B2B/create-user e novos testes de validação; lint focal e scanner. Typecheck/build pelo harness, sem execução manual proibida neste ambiente.
- Preservar as 19 RPCs executivas contidas, DRIFT-EMAILv9 e `B2B_INTERNAL_DOWNSTREAM_UNVERIFIED`.
- **GO preparação/correção focal; NO-GO provisionamento real e faturamento.** Sessão AR Bio local indisponível e zero efeitos externos não comprovado continuam gates de persistência. SQL/mock não equivale a JWT/browser.