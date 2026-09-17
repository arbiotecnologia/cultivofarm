# Central de Configuração Fiscal — catálogos oficiais e menos digitação

Objetivo: reduzir digitação manual e erro de código fiscal na Configuração Fiscal, trocando campos livres por listas pesquisáveis alimentadas por catálogos oficiais versionados — sem criar tela nova, sem mudar rotas e sem ligar produção.

## Como será executado (fases)

Cada fase termina com relatório, testes e nada publicado.

### Fase A — Auditoria de fechamento (C1–C9)
Conferir no banco Cultivo Farm o que já está aplicado (redução de base, rateio, motivo obrigatório, auditoria, XML) e registrar o estado real de:
- E2E real (C7)
- publicação do motor de XML (C8)
- fixtures de homologação (C9)

Relatório único consolidado, substituindo os antigos que mostram pendências já resolvidas.

### Fase B — Catálogos oficiais versionados (banco)
Duas tabelas novas: uma de catálogos (tipo, fonte, versão, vigência, checksum, situação Rascunho/Ativo/Substituído) e outra de itens (código, descrição, vigência, busca). Tipos previstos: NCM, CFOP, CNAE, Município IBGE, Serviço nacional NFS-e, cClassTrib, cCredPres, CBS, FCP.

- Leitura apenas para perfis internos autorizados; nenhuma escrita pela tela.
- Publicação de nova versão nunca sobrescreve a anterior em silêncio.
- Busca feita no servidor, com limite de resultados.
- Registro de importação/publicação em auditoria.

Carga inicial: CFOP completo vigente e municípios IBGE; NCM/CNAE/serviços nacionais entram conforme fonte disponível.

### Fase C — Campo de busca reaproveitável
Um único componente de seleção pesquisável (código + descrição), usado em todas as abas: busca por código ou texto, resultados paginados, estados de carregando/vazio/erro/sem permissão, teclado e mobile, e preservação de valor antigo que não exista mais no catálogo.

Para CFOP: 5101 aparece como "Padrão sugerido" no topo, com todos os demais CFOP pesquisáveis abaixo. Valor já salvo nunca é trocado automaticamente.

### Fase D — Abas Empresa, NF-e e NFS-e
- Empresa: CNAE vira busca; cidade vira busca dependente da UF preenchendo o código IBGE automaticamente (somente leitura quando vier do catálogo); coerência regime × CRT validada também no servidor; "Pronto para homologação" deixa de ser escolha livre e passa a exigir ausência de bloqueadores, com registro da transição.
- NF-e: CFOP interno e interestadual viram busca no catálogo completo; 5101 só como sugestão quando o campo estiver vazio.
- NFS-e: código nacional de serviço vira busca, trazendo junto o item da LC 116; CNAE vira busca; código municipal continua manual com aviso enquanto não houver catálogo do município.

### Fase E — Certificado, Integração e Reforma Tributária
- Certificado: nada de senha/arquivo exposto; referência do certificado deixa de ser digitável na aba de integração (vira somente leitura com atalho "Gerenciar certificado").
- Integração: provedores passam a ter nome amigável e indicação do que cada um suporta; o campo de NF-e mostra só provedores de NF-e, e o de NFS-e só de NFS-e.
- Reforma Tributária: ano de transição vira lista; documento e versão da norma passam a vir de uma referência selecionável; data da última revisão passa a ser gravada pelo servidor na mudança de situação.

### Fase F — Revisão, Homologação, Produtos, Serviços e Clientes
- Revisão: prontidão agrupada por bloco com pendências e botão "Corrigir" levando ao campo certo.
- Homologação: filtros visuais por escopo e situação, sem alterar as verificações.
- Produtos: NCM, CEST e CFOP viram busca; 5101 apenas sugerido em perfis novos compatíveis.
- Serviços e Clientes: serviço nacional, LC 116, CNAE e município viram busca coordenada.

### Fase G — Política de operação e testes
- Uma política de operação em rascunho/homologação para "venda interna de produção do estabelecimento" com CFOP 5101, sem virar regra geral.
- A resolução do CFOP continua no servidor, na ordem: política publicada → regra fiscal → perfil do produto → padrão da empresa → bloqueio quando não houver como resolver com segurança.
- Bateria de testes de CFOP (12 casos do pedido), catálogos, permissões, busca com acento, valor antigo, UF → município e regressão fiscal completa, incluindo a conferência de base 10.000 com redução de 60% e ICMS 18% resultando em base 4.000 e imposto 720.

## Detalhes técnicos

- Tabelas: `public.fiscal_reference_catalogs` e `public.fiscal_reference_entries` (UNIQUE `catalog_id, code`), índices por tipo, código, vigência e busca textual (`pg_trgm` se já habilitado). GRANTs explícitos + RLS por perfil; escrita só por RPC administrativa com `auth.uid()`, validação de perfil, `search_path` fixo e REVOKE de PUBLIC/anon.
- RPC de busca `rpc_fiscal_catalog_search_v1` (SECURITY INVOKER quando possível), limite 20–30 linhas, filtro por `catalog_type`, `parent_code` e vigência.
- Componente `FiscalCatalogCombobox` sobre Popover/Command já existentes, com React Query por `catalogType + filtros + termo`, debounce e `preferredCodes`.
- Sem motor fiscal paralelo: `fn_fiscal_apply_tax_v2`, `fn_fiscal_compute_item_taxes_v1`, `fn_fiscal_apportion_v1` e `rpc_fiscal_draft_save` permanecem as únicas autoridades de cálculo e materialização.
- Auditoria de CFOP registra anterior, novo e origem (`DEFAULT`, `MANUAL`, `POLICY`, `PRODUCT_PROFILE`, `SERVER_RESOLVED`).
- Migrations incrementais e reversíveis; nenhum campo existente é removido; snapshots e documentos históricos nunca recalculados.
- Conexão exclusivamente `swzpzcwiasxmjutrmvkm`, fail-closed; emissão em produção continua desligada; nada publicado.
