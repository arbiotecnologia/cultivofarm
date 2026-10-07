# Auditoria (somente leitura) — Cadastro de empresas na Gestão da plataforma

Nada foi alterado nesta rodada. Os números abaixo vêm do banco canônico `swzpzcwiasxmjutrmvkm` (dados de teste).

## 1. Campos atuais nas telas
- **Nova Empresa** (`OrganizationOnboardingFlow.tsx`): busca do CNPJ na Receita (via BrasilAPI), razão social/nome, nome fantasia, e-mail da empresa, plano, revisão da situação e nova digitação do CNPJ para confirmar.
- **Listagem** (`PlataformaEmpresas.tsx`): nome, nome fantasia, CNPJ e situação; busca por nome, fantasia e CNPJ; limite de 200 empresas.
- **Detalhe** (`EmpresaDetalhe.tsx`): razão social, nome fantasia, CNPJ, e-mail, situação, fuso horário, datas (criada, atualizada, cadastro concluído, ativada), assinatura (plano, situação, versão, início), responsável principal e administradores.
- **Edição**: só razão social, nome fantasia e e-mail, com motivo obrigatório. CNPJ fica só para leitura.

## 2. Estruturas já existentes (não duplicar)
- `organizations`: nome, razao_social, nome_fantasia, cnpj, cnpj_normalizado, email_corporativo, fuso_horario, status, responsavel_user_id, responsavel_definido_em, onboarding_dados (jsonb), onboarding_concluido_em, ativada_em.
- `onboarding_dados` (campos aceitos em `platform_private.onboarding_validar` e `ONBOARDING_CAMPOS`): inscricao_estadual, regime_tributario, cep, logradouro, numero, bairro, cidade, uf, telefone, email_contato, responsavel_nome, responsavel_cargo, fuso_horario, idioma. Esses dados são preenchidos pelo administrador da empresa no onboarding. Hoje 2 de 5 empresas têm CEP.
- `company_fiscal_settings` (emissor, isolado por empresa): legal_name, trade_name, cnpj, state_registration, municipal_registration, tax_regime, crt, CNAEs, fiscal_email, phone, endereço completo com código IBGE, além de séries, ambiente e certificados. Existe para 2 das 5 empresas.
- `organization_profile_audit`: histórico imutável das edições (valores anteriores e novos, motivo, chave de repetição segura).

## 3. A ficha da empresa já existe
Sim. Na aba Empresa, a lista abre a ficha interna (`EmpresaDetalhe`). Ela lê `organizations`, a assinatura e os administradores. A edição passa pela operação `platform_update_organization_profile`, que confere a data da última atualização, evita envio duplicado e grava o histórico. A ficha não mostra contatos, endereço nem dados fiscais.

## 4. Conjunto mínimo recomendado
- **Obrigatório**: razão social, CNPJ, e-mail corporativo, telefone, CEP, logradouro, número, bairro, cidade e UF.
- **Opcional**: nome fantasia, complemento, contato responsável (nome e cargo), e-mail de contato e fuso horário.
- **Somente fiscal** (fica no emissor): inscrição estadual e municipal, regime tributário/CRT, CNAEs, código IBGE do município, e-mail fiscal, séries e ambiente.

## 5. Proposta: uma ficha só, com 4 seções
Tudo dentro do `EmpresaDetalhe` atual, sem tela nova:
- **Dados básicos**: o que já existe hoje (editável).
- **Contatos**: telefone, e-mail de contato, responsável e cargo, lidos de `onboarding_dados` (editável).
- **Endereço**: CEP, logradouro, número, complemento, bairro, cidade e UF, lidos de `onboarding_dados` (editável).
- **Fiscal**: somente leitura, com resumo de `company_fiscal_settings` (IE, regime, CRT, CNAE principal, situação da configuração) e indicação "não configurado" quando não houver. A edição continua no módulo fiscal da própria empresa.
- Ainda é preciso decidir se a busca por CEP reutiliza a consulta de CNPJ já usada no fluxo Nova Empresa ou se fica sem busca.

## 6. Impacto
- **Banco**: sem tabela nova. Uma alteração pequena e reversível da operação `platform_update_organization_profile` para aceitar um bloco opcional de contatos e endereço, validado pelo mesmo `onboarding_validar`. A gravação seria parcial (merge) em `onboarding_dados` e acrescentaria `complemento` à lista de campos aceitos. O histórico continua em `organization_profile_audit`.
- **Permissões e isolamento**: nenhuma regra muda. A leitura do resumo fiscal precisa de uma consulta exclusiva do Superadmin, porque hoje as regras de `company_fiscal_settings` limitam a leitura à própria empresa. Isso ainda precisa ser confirmado antes de construir.
- **Busca**: sem mudança. Cidade/UF na busca é opcional.
- **Tipos**: tipagem local no hook, porque o arquivo de tipos gerado não pode ser editado.
- **Testes**: validação dos campos, permissão negada para quem não é Superadmin, gravação parcial sem apagar outras chaves, histórico e mudança simultânea.
- **Celular**: seções em sanfona, campos em uma coluna.

## 7. Riscos de duplicidade e fonte canônica
- Razão social, CNPJ, telefone e endereço aparecem tanto em `organizations`/`onboarding_dados` quanto em `company_fiscal_settings`.
- Regra proposta: a ficha da plataforma é a fonte do cadastro; o emissor é a fonte fiscal.
- O emissor não deve ser sobrescrito automaticamente. A ficha só mostra um aviso de divergência (por exemplo, CNPJ ou razão social diferentes).
- O CNPJ continua imutável nesta fase.

## 8. Arquivos e tabelas a alterar (próxima fase)
- `src/pages/plataforma/EmpresaDetalhe.tsx`
- `src/components/plataforma/empresaEdicao.ts`
- `src/hooks/usePlataformaSaaS.ts`
- `src/lib/saas/orgOnboarding.ts` (incluir complemento)
- Testes de `src/test/saas/` (workspace da empresa)
- Uma alteração no banco: `platform_update_organization_profile`, `platform_private.onboarding_validar` e uma consulta somente leitura do resumo fiscal para o Superadmin
- `docs/auditorias/plataforma-aba-empresa-2026-10-07.md` e `roadmap.md`
- Tabelas que só seriam lidas: `organizations` (gravação apenas pela operação existente), `company_fiscal_settings` (somente leitura) e `organization_profile_audit` (inclusão de registros)
