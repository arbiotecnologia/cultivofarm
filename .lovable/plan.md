# Pacote revisável: catálogo próprio com perfil fiscal e cadastro de Fertilizante/Adubo

Somente preparação. Nada é aplicado no banco, publicado ou ativado; você revisa os arquivos antes.

## O que será preparado
1. **Dono do item no catálogo próprio**: cada item próprio passa a registrar a empresa dona (definida pelo servidor a partir de quem está logado, nunca enviada pela tela). Itens globais continuam sem dono e iguais.
2. **Perfil fiscal do item próprio**: os mesmos campos de NF-e do global (NCM, CEST, CFOP, origem, CST/CSOSN, PIS/COFINS/IPI, unidades, GTIN, IBS/CBS), com histórico e proteção contra gravação simultânea. Só administradores/financeiro da própria empresa editam; gestor só consulta; nenhuma empresa vê ou altera item de outra.
3. **Cadastro de Fertilizante/Adubo**:
   - Global: somente Superadmin da plataforma, pela gravação canônica do catálogo, com família fixa Fertilizante/Adubo e perfil fiscal aberto em seguida.
   - Empresa: pelo cadastro do catálogo próprio existente, com a família Fertilizante/Adubo.
   - Nenhum NCM/CFOP é preenchido automaticamente; o perfil começa como "rascunho" até revisão contábil.
4. **Telas (desligadas por chave até a aprovação)**: seção "Perfis fiscais do catálogo da empresa" no módulo Fiscal da empresa; botão "Novo Fertilizante/Adubo" no catálogo global e no próprio. Com a chave desligada, tudo continua como hoje.

## Provas
- Testes locais em banco descartável: empresa A não lê/grava item ou perfil da empresa B; gestor não grava; tenant não grava global; Superadmin não grava item próprio de empresa; conflitos de versão recusados; reenvio com mesma chave não duplica.
- Testes de tela com a chave ligada e desligada; regressão fiscal e catálogo.
- Esses testes não certificam login/RLS reais; validação com contas ARBio e FSF fica como roteiro não executado.

## Fora de escopo
Aplicar SQL, publicar, emitir NF-e, cobranças, automações, alterar perfis/roles, inventar classificações fiscais.

## Detalhes técnicos
- Pacote em `scripts/fiscal-tenant-catalog-20261101/` com AGENTS.md, `install.sql.review`, PRE/POST com pins, rollback deny-only, testes PG descartáveis, logs `.log.txt`, diff e SHA256SUMS.
- Antes de escrever, auditoria read-only (ref `swzpzcwiasxmjutrmvkm`) de como o catálogo próprio é salvo hoje (`OwnedCatalogItemDialog`, RPCs owned/transacionais) e das policies de `product_fiscal_profiles`; reutilizar essa tabela com coluna de empresa derivada do item, sem tabela paralela.
- Escrita via RPC SECURITY DEFINER com `search_path` fixo, ator real/empresa ativa, CAS por `updated_at`, chave idempotente; EXECUTE revogado de PUBLIC/anon; sem GRANT ao aplicar até sua autorização.
- Gravação global de fertilizante reutiliza o writer canônico do catálogo global (`set_global_product_family_core` preservado), sem fluxo paralelo.
