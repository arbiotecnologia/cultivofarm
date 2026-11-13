# Unificação fiscal — 2026-11-13

Base: 41c740652. Somente código local; nada publicado, emitido ou gravado em dados reais.

## Entregue
- Regra única CRT→ICMS: `supabase/functions/_shared/fiscal/nfe/icmsRegime.ts` (CRT 1/4 CSOSN; 2/3 CST). Motor `buildNfeXml.ts` corrigido (CRT 2 antes caía em CSOSN; CRT 4 caía em CST) e pré-emissão consome a mesma função.
- Verificação de pendências `src/lib/fiscal/preEmissionPendencies.ts`: produto/microrganismo, cliente (inclui endereço principal), apresentações (`catalogo_volumes`) e conversão para unidade tributável, serviço, CFOP do item versus cenário.
- Guias Fiscais com edição pelo MESMO editor: produto (aba Fiscal), microrganismo (seção Fiscal), cliente (cartão), serviço (pendências na linha + `?servico=`). Atalhos `?produto=`, `?cliente=`, `?servico=`.
- Visão Geral Fiscal: cartão "Catálogo fiscal" com com/sem perfil por família, sem classificação, outras famílias, microrganismos, clientes, serviços.
- Configuração fiscal: nova aba "Catálogo de produtos" (`?aba=catalogo`) reusando a tela existente.
- Rascunho NF-e/NFS-e → Revisão: "Pendências fiscais por cenário" com correção contextual; não altera rascunho nem notas emitidas.
- Conflito de unicidade (23505) de perfil de microrganismo tratado como "Perfil já existe"; clientes/serviços já tratavam; produto usa RPC idempotente/CAS.

## Testes
- preEmissionPendencies 17/17; nfeXmlEngine + ICMS20 + XSD 52/52 (inclui CRT 2 → ICMS00 válido no XSD, CRT 4 → CSOSN).
- fiscalGuidePanel.ui 4/4 (visualizar sem gravar, novo com cliente pré-selecionado, reabrir existente, gestor só leitura).
- preEmissaoSecao.ui 3/3 (interna MG→MG, interestadual MG→SP com CFOP errado, CRT 2, correção abre o editor).
- Bateria fiscal+catálogo: nova 38 falhas antes da correção de serviços; baseline 41c740652: 33 falhas. Diferenças: 5 de fiscalServicos (corrigidas, 5/5 passam) e h7i (passa isolado, 4/4). Demais falhas idênticas à baseline (ver failures-*.txt).

## Limitações
- Sem sessão real/JWT/RLS hospedados nem navegador autenticado; testes usam leitores simulados.
- Contagens da Visão Geral dependem da RLS do usuário; não comparadas à auditoria de produção (9 produtos, 7 microrganismos, 6 clientes).
- A seleção de produto no rascunho ainda preenche o CFOP interno; a pré-emissão aponta o erro em operação interestadual, sem trocar automaticamente.
- Classificação fiscal (NCM/CST etc.) não é inferida; pendências só indicam ausência.

## Aceite de navegação (2ª rodada)
- Menu: Administração > Fiscal = Visão Geral Fiscal (/fiscal/prontidao), Configuração Fiscal (/configuracoes/fiscal/empresa, aba ?aba=catalogo), Perfis Produtos/Serviços/Clientes, Rascunhos. Aliases /fiscal/perfis/* mantidos; permissões inalteradas.
- Serviço: não existe cadastro-mestre de serviço; o cadastro É o perfil em /configuracoes/fiscal/servicos. O editor agora traz "Guia Fiscal" com pendências.
- CFOP do rascunho: draftCfopSelection.ts; testes 10/10.
- Bateria fiscal+catálogo+menu: 33 falhas, idênticas à baseline exceto h7i (timeout de 5 s ao varrer a árvore sob carga; passa isolado) e unifiedProducts.realClient (falha intermitente na baseline, passou agora).
- Chromium sem sessão (projeto Supabase externo, sem sessão injetável): 9 rotas/aliases redirecionam a /auth sem erros de página. Menu autenticado não verificado no navegador.
