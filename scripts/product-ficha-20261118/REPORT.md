# Evidências e limites

## Executado localmente

- Vitest final: `bun run test -- src/test/catalogo src/test/fiscal/productDossierManagement.test.tsx src/test/fiscal/dossierDocumentViewer.test.tsx src/test/protocolos/productTechnicalProfileReadOnly.test.tsx`: **61 arquivos, 1074 testes PASS**, incluindo recuperação sequencial de produto/composição, schema do bundle, bloqueio/cancelamento de rascunho do dossiê e regressões microrganismos/IA.
- `python3 test_pg.py`: **25 checks PASS**, incluindo candidato persistido e candidato ausente negado; gate fechado, leitura/leitor, isolamento A/B, writer negado, replay, URL segura, CAS, feature revogada e falha tardia transacional sem perfil/recibo. Actor/motor históricos carregados; identidade, schema/config e receipt reconstruídos são **sintéticos**, não prova hosted.
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

## Atualização root — 03:48 UTC: alinhamento já aplicado somente HML

O root informou aplicação de `product_audit_hml_alignment_20261118` e POST/captura transitiva revisados. **Não recriar o alinhamento.** Hashes pós informados:

- `tenant_product_save`: `2ada245dea57bbf19d2525cf57ecc4da` (igual produção).
- `recorte_a_actor_fresh`: `0cb006c428fc13b0bf0fd7e2759f7a99`, owner-only.
- `solid_pack_unit_apply`: `99ab68e0c7076838c2b08c5ecdd67d72`.
- `tenant_product_validate`: `c1d561b4e8a2a458235551a8113049ed`; diferença anterior somente comentários segundo root.

Root relatou **29 HTTP Auth reais HML PASS**: criação/unidade/replay/chave alterada/CAS/isolamento/anon/campo proibido/preço negativo/reabertura, IA sem economia/fiscal/aprovação/formulação, JWT antigo após revogação de role/feature e metadata preservada após composição recusada com recuperação/replay. IA real Serifel/BASF retornou HTTP200 descrição com fontes oficiais verificadas; produto fictício sem documentos retornou HTTP200 sem candidatos/sugestões.

Esses resultados são **baseline backend independente**, não prova da nova ficha, do novo delta de fontes persistidas ou do browser integrado. A divergência 03:47 acima permanece registro histórico; o bloqueio de alinhamento foi superado pelo root, sem qualquer execução hosted pelo agente.

Nesta continuação foram acrescentados schema/target/revisão tipados na leitura, retenção explícita `candidate_key` apenas nas evidências de produto (envelope de microrganismos preservado), bloqueio de saída/versão com dossiê sujo ou documento aberto e cancelamento explícito do rascunho. Evidência continua ligada ao texto exato: edição manual não mantém a fonte como comprovação do novo texto; histórico privado não é apagado.

## Fechamento local dos gaps do REPORT 8de0b8fb4

- Culturas/alvos/fontes próprios têm edição integrada, rascunhos Aplicar/Cancelar, opções reais e preservação de ID/nome canônico. Alterações confirmadas entram pelo motor de perfil existente; não há DML/browser writer paralelo. Recomendações não têm updated_at no schema: CAS usa linha JSONB inteira capturada; metadados/composição sequenciais intocados.
- Perfil exige todos os campos de conteúdo, timestamps/status tipados; null confirmado é ausência, undefined/shape inválido/erro não viram ficha vazia. Filhos têm target/schema validados e opções limitadas; links legados inseguros não são navegáveis.
- Parent save/seção/close bloqueados com vínculo/dossiê pendente, inclusive fechamento da janela ProdutosTab. Vínculos já aplicados permanecem em memória entre seções; revisão não perde campos, CAS não é rebase automático.
- Recusa SQL definitiva mantém rascunho e exige fresh read antes de liberar nova chave. Conflito de vínculo tem reconciliação explícita por linha. Rede/ACK inválido/timeout são incertos: mesma chave/argumentos e exportação, não nova intenção. Campo manual/IA não altera snapshot durante envio.
- IA acompanha identidade/dossiê com reset fabricante/registro; fetch pendente/erro não pesquisa com valores antigos. Produto continua product_strain; fontes exatas por candidate_key/campo/texto mantidas. Microrganismos e seus instaladores não alterados.
- Montador novo `assemble.py` exige captura integral UTF-8/LF por ambiente, root7db253 e freshactor0cb006, owner/ACL/triggers/estrutura e dependências preservados. Input simplificado do montador antigo agora recusado. PRE/POST integrais, gate OFF, reinstall somente POST exato e rollback não destrutivo preparados. Pins locais sintéticos continuam sem autorização de instalação.

## Evidência desta continuação

- Vitest: **62 arquivos / 1084 PASS** (catálogo completo, microrganismos/IA compartilhada, recuperação sequencial, schema, vínculos, dossiê/document viewer). Avisos de refs/controlado nos componentes compartilhados persistem.
- PostgreSQL descartável: **40 checks PASS**, cultura canônica, replay único, cross-tenant negado, CAS linha inteira, falha tardia sem filhos/recibo, helper privado negado, gate/rollback/release e fontes por texto exato. Motor/actor históricos e identidade/schema/recibo reconstruídos são sintéticos; freshactor da bateria é stub explícito. Não prova o freshactor real nem JWT/RLS hospedados.
- Python montagem: **4 negativos PASS** (proveniência sintética, ref ausente, UTF8/hash divergente, CRLF recusado). Montagem positiva integral ainda não executada por ausência de captura root PRE/POST; não alegar instalável sem essa etapa.
- Chromium desktop1280×1800/mobile390×844: IA gerar/aplicar/salvar/reabrir fontes, vínculo pendente bloqueia salvar/seção e cancelamento libera, um diálogo, sem overflow/pageerrors. Transporte/Auth interceptados sintéticos; não browser HML. Capturas inspecionadas.
- Deno check bundles explícitos HML/produção PASS; nenhuma implantação/inference nova. Harness automático build OK inclui tipos; não rodado build/typecheck manual conforme plataforma.

## Pendências externas exatas — não certificado para publicação

1. Root entregar captura exata integral PRE/POST e revisão transitiva; executar montador/reinstall/rollback no espelho com dependências reais. Código/consulta/envelope estão entregues; não depende de DSN do agente.
2. Root instalar delta HML e executar Auth A/B/anon/leitor/revogação/lock/replay, vínculos editar/salvar/reabrir, dossiê/upload pendente, fontes IA persistidas e navegador real integral. Os 29 checks backend e IA Serifel relatados acima são baseline, não essa homologação.
3. Nenhuma escrita produção/hosting/subagente. Dados dos 27 microrganismos e oito produtos reais intocados; disponibilidade atual de secrets não consultada.
