# Evidências e limites

## Executado localmente

- Vitest: `bun run test -- src/test/catalogo src/test/protocolos/productTechnicalProfileReadOnly.test.tsx`: **58 arquivos, 1044 testes PASS**, incluindo recuperação sequencial de produto/composição, scope change e regressões microrganismos/IA.
- `python3 test_pg.py`: **22 checks PASS**, gate fechado, leitura/leitor, isolamento A/B, writer negado, replay, URL segura, CAS, feature revogada e falha tardia transacional sem perfil/recibo. Actor/motor históricos carregados; identidade, schema/config e receipt reconstruídos são **sintéticos**, não prova hosted.
- Deno check dois bundles explícitos HML/produção PASS. Não houve inference real nova.
- Chromium 1280×1800 e 390×844: gerar/aplicar/salvar/reabrir fontes PASS com Auth/transporte interceptados sintéticos e componentes reais; um diálogo, sem overflow nem pageerror. Capturas revisadas visualmente. Avisos React de refs em componentes compartilhados continuam presentes; não são considerados ausência de console errors.
- Harness automático registra `build OK`, incluindo validação de tipos. Não foi executado build/typecheck manual conforme regra da plataforma.

## Entregue

Nome clicável/editor amplo e conteúdo técnico integrado, composição consultiva, seções de uso/B2B/fontes e dossiê canônico; IA recebe fabricante/registro/cepa do dossiê, comparação e campos selecionados, fontes HTTPS por campo, replay/CAS observados e bloqueio durante salvamento. Global/leitores não recebem escrita. Preço/composição/fiscal/aprovação fora da IA. Não foi alterado nenhum dado fiscal ou dos 27 microrganismos.

## Descoberta independente root — 18/11/2026 03:47 UTC

Informações abaixo **relatadas pelo root a partir de captura via conector**, não recapturadas nem executadas pelo agente nesta atualização:

| Contrato/controle | HML | Produção |
| --- | --- | --- |
| tenant_product_save | `b08824625713362221cf10cc683239b8` | `2ada245dea57bbf19d2525cf57ecc4da` |
| tenant_catalog_formulacoes_replace | `6b5462bffdc1768caee441a821a69986` | igual |
| tenant_catalog_root_save | `7db253bcc2150276ea2bb2f7bd90e471` | igual |
| capability IA | `7ad7237f337ff319038c6de579c67931` | igual |

Produção usa `platform_private.recorte_a_actor_fresh('mutate')`, reautoriza após advisory locks e row locks e antes de replay/retorno. HML usa `catalog_tenant_actor` e não possui `recorte_a_actor_fresh`. **Não são fundamentos equivalentes**; testes de HML anterior não certificam a autoridade do writer de produção. O root prepara alinhamento mínimo HML e captura/revisão das dependências. Nenhum alinhamento, alteração de pin ou mudança de writer é executado por este pacote nesta atualização.

Baseline AR Bio informado em produção: **8 produtos**, hash `2b8048490a17a5b915c85d2d194577b5`. Controle para comparação independente futura, não hash verificado pelo agente nem autorização para ler/alterar linhas reais.

`produtos` e perfis não possuem fabricante/registro segundo a captura. A identidade documental continua vindo do dossiê canônico; não criar campos fictícios nem replicar sua autoridade. Metadados e composição permanecem sequenciais; fontes precisam corresponder à sugestão/candidato/campo/valor exatos aceitos. Igualdade dos três contratos auxiliares não elimina o gate do writer de metadados, nem os gaps de captura completa já listados.

## Gaps reais — não certificado para publicação

1. Captura exata por ambiente e POST/ACL/owner/triggers/estrutura completos ainda não fornecidos/fechados; artefato SQL de laboratório e seus pins NÃO são LIVE. Builder recusa pins sintéticos como input implícito, mas montagem final requer recomposição auditada. Fundação divergente exige revisão adicional.
2. HML Auth/JWT/RLS/Storage, geração real produto, revogação durante espera e concorrência integrada não executados nesta rodada. Relatos antigos de microrganismos não certificam produto.
3. Bundle de perfil legado ainda tipa parte dos retornos sem validação estrutural completa; necessidade de endurecer schema antes da liberação, sem esconder erros.
4. Culturas/alvos/fontes legados estão consultivos nesta ficha; a edição canônica integrada dos vínculos de produto não foi concluída neste delta. Dossiê existente foi reutilizado, sem nova autoridade/aprovação; seus rascunhos/visualizador precisam teste adicional de saída/troca de seção sem perda ou sobreposição. Não declarar ficha integralmente concluída.
5. Cadastro novo só disponibiliza ficha de conteúdo após ID confirmado; a entrada catálogo/mobile/fiscal reutiliza componentes existentes, mas a matriz completa de navegação/perfis não foi exercitada no browser real hospedado.

Disponibilidade de secrets/provider desta rodada não consultada; LOVABLE_API_KEY HML informado anteriormente pelo root não equivale a validação atual. Nenhum acesso hosted/produção, deployment, publicação ou subagente utilizado.