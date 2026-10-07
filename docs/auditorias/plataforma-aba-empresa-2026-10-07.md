# Gestão da plataforma — aba Empresa — 2026-10-07

## Auditoria (Fase 0)
- `organizations`: superadmin lê por policy `Superadmin le empresas`; tenants leem só a própria (`organizations_select_scoped`). Não existe policy de escrita; o trigger `organizations_guard_status` exige ticket `org_write` para alterar campos cadastrais e de situação.
- Já existiam: `platform_create_organization` (onboarding), `platform_set_organization_status` (situação, motivo ≥ 5, auditoria `organization_status_audit`), convites (`platform_org_admin_invites`), assinaturas (`platform_transition_subscription`).
- Não existia rotina para editar dados cadastrais → criada uma única RPC.
- Campos editáveis com segurança: razão social (espelhada em `nome`), nome fantasia, e-mail. Imutáveis nesta edição: CNPJ/`cnpj_normalizado` (sem regra aprovada de correção), situação, responsável, plano/assinatura, administradores, dados de onboarding, datas.

## Migrations aplicadas (Supabase canônico `swzpzcwiasxmjutrmvkm`)
1. `20261007011615_d5b8bf31-c502-4e45-b9fd-89bda2c5b7ea.sql` — tabela `organization_profile_audit` (somente leitura para superadmin, imutável por trigger, chave idempotente única) e RPC de edição.
2. `20261007011651_b81c5c12-bdc6-4e77-8c4e-19d84da1a550.sql` — padrão do projeto: `public.platform_update_organization_profile` SECURITY INVOKER; núcleo SECURITY DEFINER movido para `platform_private.update_organization_profile_core` (linter: nenhum alerta novo).
3. `20261007011801_c3dea3b9-4245-47c4-a705-fc5f0f5b76db.sql` — revoga INSERT/UPDATE/DELETE/TRUNCATE da auditoria para `authenticated`/`anon`/PUBLIC.

RPC: `auth.uid()` + `is_platform_superadmin`, `search_path=''`, sem EXECUTE para PUBLIC/anon, normalização (espaços, e-mail minúsculo), motivo ≥ 2, `FOR UPDATE`, concorrência por `updated_at` esperado, idempotência por chave (mesmo conteúdo → mesmo resultado; outro conteúdo → conflito), antes/depois + autor + data/hora + origem + motivo, ticket `org_write`.

## Prova no banco real (transação desfeita)
- Visitante sem login: edição e leitura da auditoria negadas.
- Usuário comum e admin de empresa: RPC, núcleo direto e UPDATE direto negados; auditoria invisível.
- Superadmin: motivo de 1 caractere, e-mail inválido e versão antiga negados; salvar OK; retry com a mesma chave idempotente (sem duplicar); mesma chave com outro conteúdo = conflito; segunda aba com versão antiga = conflito; 1 auditoria com antes/depois e autor corretos; auditoria não alterável nem apagável (inclusive pelo dono do banco); CNPJ/situação/responsável inalterados.
- Nenhum dado real ficou alterado.

## Frontend
- `PlataformaHome.tsx`: aba "Empresa" (chave `empresas` preservada); lista de abas com rolagem horizontal, `aria-label`, foco visível e alvos ≥ 40px; atalhos levam a empresa para Administradores, Assinaturas (pré-seleciona a empresa) e Histórico (filtro de exibição com "Mostrar todas").
- `PlataformaEmpresas.tsx`: lista primeiro (título, busca, "Nova Empresa", tabela no desktop e cartões no celular); onboarding só ao clicar, com Voltar; após criar, "Ver empresa" abre o detalhe; "Abrir empresa" por linha; menu "Mais ações" com Administradores e transições de situação (motivo ≥ 5 mantido), sem abrir a linha.
- `EmpresaDetalhe.tsx` (novo): dados cadastrais, situação, datas, plano/assinatura (somente leitura), responsável e administradores, histórico de situação e cadastro; "Editar empresa" só para Platform Superadmin; CNPJ somente leitura com explicação; envio único em duplo clique.
- `PlataformaGestao.tsx`: `AlterarAssinaturaCard` aceita empresa inicial.
- `usePlataformaSaaS.ts`: `useEmpresaDetalhe`, `useAuditoriaEmpresa`, `useEditarEmpresa` (colunas explícitas, sem `SELECT *`).
- `empresaEdicao.ts` (novo): validação, comparação, CNPJ formatado, busca e mensagens seguras.

## Testes executados
- Novo `src/test/saas/plataforma-empresa-workspace.test.tsx`: 9/9.
- Pasta `src/test/saas`: 253/253. Suíte completa: 5.549 passaram, 4 pulados.
- Typecheck (`tsgo`), ESLint dos arquivos alterados, build e scanner de segredos: OK.

## Não verificado
- Tela com login real de Platform Superadmin (projeto externo: sessão de navegador não disponível nesta ferramenta); visual mobile/desktop verificado só por testes de estrutura.

## Pendências
- Paginação server-side da lista de empresas: hoje limite de 200 com aviso na tela. Critério: implementar quando houver mais de 150 empresas ou a consulta passar de 500 ms.
- Filtro do Histórico por empresa é só de exibição sobre dados que o superadmin já lê; a lista de histórico continua limitada a 200 linhas.
- Correção de CNPJ: exige fluxo próprio aprovado.

## Rollback
`DROP FUNCTION public.platform_update_organization_profile(...)` e `platform_private.update_organization_profile_core(...)`; manter `organization_profile_audit` (histórico). Frontend: reverter pelo histórico do projeto.

## GO/NO-GO
GO para uso, condicionado à verificação visual com login real de Platform Superadmin após publicar.

## Fase 2 — Cadastro empresarial completo (2026-10-07)

**Desenho:** ficha única `EmpresaDetalhe` com seções Dados básicos, Contatos, Endereço e Dados cadastrais/fiscais; sem tela, rota ou tabela nova. Fonte do cadastro: `organizations` + `onboarding_dados`. Fonte fiscal: `company_fiscal_settings` (somente leitura, nunca sincronizado). Divergências de razão social, CNPJ e IE são apenas sinalizadas.

**Banco (2 migrations):**
- `platform_private.onboarding_validar`: + `complemento` (120), UF restrita às 27 unidades, CEP normalizado `00000-000`.
- `platform_private.org_cadastro_patch`: whitelist (telefone, e-mail de contato, responsável/cargo, endereço, IE, fuso), anti mass-assignment.
- `platform_update_organization_profile` (INVOKER) → `update_organization_profile_core` (DEFINER, privado): `_dados jsonb` opcional, merge que preserva chaves não enviadas; `''` limpa só a chave enviada; fuso também na coluna; auditoria com `dados` antes/depois por campo + `dados_patch` na idempotência; motivo obrigatório, `expected_updated_at`, ticket `org_write`.
- `platform_create_organization` agora INVOKER → `platform_private.create_organization_core` (DEFINER): `_dados` validado; telefone, CEP, logradouro, número, bairro, cidade e UF obrigatórios; sem evento extra de perfil (criação segue em `organization_status_audit`).
- `platform_get_organization_fiscal_summary` (INVOKER) → `organization_fiscal_summary_core` (DEFINER, privado): devolve só razão, CNPJ, IE, IM, regime, CRT, CNAE principal, situação, NF-e/NFS-e habilitadas. Sem certificados, refs, séries ou configurações. RLS de `company_fiscal_settings` inalterada (4 políticas).
- Grants: EXECUTE revogado de PUBLIC/anon; apenas authenticated/service_role. Todas validam `auth.uid()` + `is_platform_superadmin`.
- Rollback: restaurar as definições anteriores (6/7 argumentos) dos três RPCs e remover `org_cadastro_patch`, `organization_fiscal_summary_core` e `create_organization_core`; dados gravados em `onboarding_dados` permanecem compatíveis.

**Frontend:** `EmpresaDetalhe.tsx`, `PlataformaEmpresas.tsx` (ações Ver/Editar), `OrganizationOnboardingFlow.tsx` (contatos/endereço/IE pré-preenchidos pela consulta do CNPJ, revisados antes de criar), `CadastroEmpresaCampos.tsx` (novo, compartilhado), `empresaEdicao.ts`, `usePlataformaSaaS.ts`, `orgOnboarding.ts`.

**Evidências:**
- Prova SQL com rollback no banco canônico (fixture fictícia, CNPJ 11222333000181, resíduo 0): 28/28 PASS, mais 3/3 PASS na prova de concorrência. Cobriu criação completa, campos obrigatórios, mass-assignment, UF/CEP/telefone/e-mail inválidos, CNPJ duplicado, merge preservando chaves, auditoria campo a campo, idempotência e conflito de chave, versão desatualizada, motivo, CNPJ imutável, limpar IE e definir fuso, resumo fiscal vazio e sem campos sensíveis, não-Superadmin negado (público e núcleo), chamada sem `auth.uid` negada, ACL anon e RLS fiscal intacta.
- Vitest SaaS + Comunicação 799/799 (inclui `empresa-cadastro-completo.test.ts` e novos casos de UI); typecheck, lint focal, build e scanner de segredos passaram.
- Advisors: a nova função DEFINER exposta foi movida para schema privado; os 465 avisos preexistentes não foram tratados.

**Não verificado / pendências:** navegador autenticado desktop/mobile real; busca por cidade/UF adiada (exigiria filtro amplo no cliente); o rótulo da situação do emissor só foi confirmado para o valor `DRAFT` existente.

**Decisão:** GO técnico.
