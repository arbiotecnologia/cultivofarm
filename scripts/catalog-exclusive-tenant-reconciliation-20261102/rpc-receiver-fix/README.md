# Catálogo — correção local do receiver e cache de ProdutosEmpresa

## Patch para espelhamento

- `catalog-products-receiver.patch`: somente `src/hooks/useTenantProducts.ts` e teste `src/test/catalogo/tenantProducts.realClient.test.tsx`, incluindo os dez cenários finais.
- `runtime.patch`: somente a alteração do hook.
- Base com defeito: `16f60b95b7a43a026baf53d3bfb931bba203308b`.
- Commit automático inicial da correção: `a7caecef9269cc7412d912f614785cbf7ce93acd`; usar o patch completo para incluir os testes adicionais posteriores.
- Conferir o patch antes de aplicar no isolado; divergência de conteúdo exige revisão, não aplicação forçada.

## Correção e escopo

A extração `supabase.rpc` perdia o receiver. O hook agora usa `bind(supabase)` nas três operações, sem cliente paralelo no runtime ou mudança de argumentos financeiros, CAS, payload ou servidor.

`tenant-products` sozinho não distinguia conta/empresa. O wrapper existente acrescenta ator/empresa/papéis/época e request, oculta cache não pronto, cancela/remove escopos antigos e recusa respostas atrasadas. Mutações capturam o contexto antes da chamada e recusam ACK tardio; invalidam somente o escopo original após sucesso válido. Nenhuma resposta frontend concede autoridade.

## Auditoria de consumidores do catálogo

| Consumidores | Forma da chamada | Resultado |
|---|---|---|
| useTenantProducts | extração sem this | Corrigida por bind |
| usePartnerCatalog/usePartnerCatalogTecnico/useCatalogoAlvos | supabase.rpc(...) | Receiver preservado |
| useFiscalCatalog/useFiscalNfeReadiness | cast do cliente seguido de .rpc(...) | Receiver preservado |
| useFiscalPreflight/useFiscalXmlEngine/useFiscalRascunho/useFiscalSefazTransmissions | bind(supabase) | Receiver preservado |
| lib/catalogo/platformCatalog*, catalogLabelDisplay | bind(supabase) | Receiver preservado; nenhum gate alterado |
| lib/catalogo/tenantCatalogRoots/Visibility/Ownership | client.rpc(...) | Receiver preservado |
| ProdutosTab, ApprovalChecklistDialog, ReturnToReviewButton, VersoesHistoricoTab | client/supabase.rpc(...) | Receiver preservado |
| useProductProfile/useMicroorganismProfile | client.from(...) e saveTenantCatalogRoot(client,...) | Sem extração de rpc |

A busca também encontrou extrações sem bind em consumidores de outros domínios (por exemplo useAuth/internalContextProbe/producerContextProbe e listas comerciais). Não foram modificados nesta correção de catálogo nem certificados; exigem escopo próprio. Não reintroduzimos candidatos financeiros.

## Evidências finais

- Teste SDK real: reproduz `reading rest` com método extraído, zero fetch; list/save/archive chegam a POST /rest/v1/rpc com header Authorization sintético e parâmetros exatos. Somente fetch e contexto Auth são simulados, nunca rpc/parser.
- Dez cenários: list/save/archive, backend 403 nos três, cache A→B, cache preenchido trocando só ator ou só tenant, ABA/resposta atrasada, ACK tardio e contexto não pronto zero REST.
- Focados iniciais: 15/15 (sete novos + oito contratos); rodada final: 177 arquivos, 2876 testes PASS, incluindo dez novos, perfil maxWorkers=2/minWorkers=1.
- Separação original: 5/5; contratos financeiros originais permanecem byte a byte da base e candidatos fora de src.
- Build automático: OK; diff-check do patch: sem erros.
- Typecheck separado não executado nesta rodada: o ambiente proíbe sua execução manual; build automático não é apresentado como typecheck independente.

## Limites e próximo passo independente

Somente teste local, transporte sintético sem saída de rede. Header sintético prova montagem do transporte, não autorização JWT hosted. Nenhum SQL hosted, publicação, implantação, sessão real, emissão fiscal, cobrança ou SMTP. Catálogo continua NO-GO até revisão/POST/JWT reais.

Após espelhar, o auditor testa `/configuracoes/produtos` em sessão real no isolado: listar, salvar edição com CAS observado, arquivar item autorizado, recusa backend, troca de conta/empresa e resposta atrasada. Não criar fixture de produção, não ampliar ACL nem aplicar SQL financeiro/fiscal para este patch.