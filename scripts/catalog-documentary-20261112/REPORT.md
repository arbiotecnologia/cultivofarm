# Base Técnica — entrega parcial revisável

## Integrado na prévia
- Produtos: filtros Todos, Biológicos, Produtos químicos, Fertilizantes/Adubos e Sem classificação usando exclusivamente `familia_catalogo`. Adição nas famílias preseleciona o campo, inclusive listas vazias; edição usa o mesmo writer/ID e não substitui ficha/composição.
- Culturas e microrganismos: cadastro/edição pelo contrato existente `tenant_catalog_root_save`, com CAS e chave, sem escritor global. Leitura e preferências de visibilidade preservadas; apenas itens da empresa permitem edição. Erros preservam rascunho; intenções inconclusivas não podem ser trocadas.
- Catálogo Técnico: Criar ficha/Editar ficha nos itens da empresa; conteúdo manual de produto/microrganismo sem aprovação automática, rascunho protegido de refetch, escopo e ACK tardio. Parceiros continuam leitores.
- Gerar com IA nos formulários de produto/microrganismo e fichas: identificação por nome/fabricante/registro, comparação atual/sugestão, seleção por campo, fontes, escolha de identificação ambígua, erro/abort sem alterar formulário.

## Pendências concretas — não declarar entrega integral
- `catalogo_problemas` é catálogo global sem contrato de escrita tenant autorizado; ações existentes permanecem contidas. Criar/editar problema da empresa requer contrato de propriedade/RPC revisado, não remover `assertGlobalCatalogWriteBlocked`.
- Vínculos culturas/alvos ainda têm hooks de gravação globais contidos e não estão liberados. Cadastro inline associado a esses vínculos ainda não foi implementado. Não usar DML direto nem interpretar políticas candidatas como autorização instalada.
- Famílias: três valores canônicos existentes apresentados mesmo vazios; não foi encontrado contrato de ativação/desativação de família. Rótulos ativos são classes, não famílias, e não autorizam inferir novas famílias.
- IA: novo serviço NÃO instalado. UI falha explicitamente preservando formulário. Fontes revisáveis: `inference.ts`, `edge-handler.ts.review`, `capability.sql.review`; montagem Edge e promoção dependem de revisão independente de autoridade, geração de tipos/modelo, disponibilidade/retention e prova de grounding documental. Capability sem EXECUTE para clientes. Não houve inferência real.
- Retenção/fornecedor e busca do modelo devem ser reconfirmados antes de implantação. URLs observadas na busca não provam, por si só, veracidade de cada afirmação; revisão humana das citações continua necessária.
- Sem sessão gerenciada para Supabase externo: nenhum fluxo JWT/RLS hospedado foi exercitado. Nenhuma alteração em dados reais, SQL remoto, Edge, publicação, emissão ou envio.

## Evidência local
- 116 testes PASS em 10 arquivos: sugestões/ambiguidade/fontes/seleção/erro/escopo, referências com SDK real e transporte sintético, CAS e status separado, permissões, produtos e regressões CAT06–10/culturas. Primeira bateria de referências falhou por ACK sintético sem `ok`; corrigido fixture para envelope canônico, sem relaxar parser.
- Build/typecheck automático da prévia OK (log observado em 12/11/2026 03:54:22 UTC); check final acompanha log de observabilidade.
- Playwright local com módulos Auth/transporte substituídos por fixtures sintéticas e todos os destinos externos abortados. Desktop: família selecionada e diálogo de cultura com rascunho; nenhum erro de página. Mobile identificou excesso horizontal na barra de ações, corrigido com quebra de linha; rechecagem registrada separadamente. Não é sessão real nem prova servidor.
- Evidência temporária: `/tmp/catalog-all-tests.log`, `/tmp/browser/catalog-documentary/`; fontes de testes mantidas em `src/test/catalogo/documentarySuggestions.test.tsx`, `catalogReferences.realClient.test.tsx` e regressões existentes.

## Aplicação
Frontend somente para funcionalidades integradas; servidor de pesquisa é candidato INATIVO e não aplicável sem revisão/assemblagem. Nunca transportar mocks, harness ou dados para runtime. Nenhum gate existente foi habilitado.