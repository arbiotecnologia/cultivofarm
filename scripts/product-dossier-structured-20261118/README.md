# Registros e garantias estruturados — candidato independente

## Escopo implementado
Dossiê exclusivamente do produto para `quimico` e `fertilizante_adubo`, nas entradas já existentes desktop/mobile e na ficha. Criação pelo contrato canônico `tenant_product_dossier_management_create(product_id, NULL)`, seleção explícita do novo escopo, sem microrganismo ou transformação de históricos. Titular, fabricante, número, órgão e situação **documental**; nenhuma afirmação de aprovação MAPA/ANVISA/fiscal. Linhas tipadas de substância/nutriente com decimal **textual exato**, unidade, base e forma documental, fonte/trecho e anexo privado opcional. Cadastro manual com Aplicar/Cancelar, revisão observada, lock, tentativa incerta de mesma chave, exportação e retomada após consulta fresh em recusa definitiva. IA não acessa este writer nem preenche valores estruturados: permanece nos nove campos documentais já revisados; 402 não foi contornado.

Sem conversão entre massa/volume, dose ou garantia presumida; nenhuma composição real fertilizante foi inventada. `PENDING` e `DOCUMENTED` não significam validação. Garantias existentes em textos continuam intocadas e não são transformadas automaticamente.

## Dependências root — não resolvidas por wrappers
HML possui somente context reader, não full management. O root deverá instalar/revisar **independentemente** a cadeia canônica das migrations `20261114023631` em diante e seus pré-requisitos versionados, com seus patches finais (ACL/serviço/row fence/Storage). Não usar `management/tenant-owner.sql` nem o instalador histórico como novo ambiente autorizado. O builder deste pacote ABORTA se algum corpo exigido estiver ausente ou divergente do manifesto de pins revisado; não instala dependências por tentativa. As wrappers públicas INVOKER e dispatch privado permanecem na arquitetura canônica; este pacote NÃO concede USAGE geral no schema privado. O teste local declara USAGE como costura de fixture; isto NÃO prova dispatch hosted e deve ser conferido pelo root antes de instalar.

## Artefatos exatos
- `delta.sql.review`: schema aditivo, três tabelas privadas RLS/ACL owner-only, gate OFF, history/receipts; núcleos privados para criação/save/leitura/validação.
- `capture-query.sql.review`: catálogo completo das relações envolvidas, colunas/defaults/constraints/ACL/RLS/policies/triggers/indexes, funções com definição UTF-8/MD5/owner/ACL/config/volatility e publicações. Somente root-local; não enviar resultados ao agente.
- `build.py`: extensões paramétricas dos corpos **capturados atuais**, com pins externos exatos; ramo exclusivo product-only, recheck fresh pós-esperas/replay/retorno e wrappers preservadas.
- `assemble.py`: PRE → delta → POST integral, numa transação, com locks; metadata da autoridade fresh inalterada e sem alteração de publicações. POST é normalizado pelo root no PostgreSQL local, não inventado pelo agente.
- `rollback.sql.review`: gate OFF mantendo dossiês, documentos, recibos e histórico. Não restaura NOT NULL nem corpos vulneráveis.
- `build_document_edge.py`: candidato de transporte privado build-time ligado ao ref explícito; aceita micro NULL **somente** no request cujo reader canônico server-side comprova product-only. Mantém JWT, verificação de hash/tamanho, autoridade antes/depois dos bytes, URLs no-store, todos os uploads/atestos canônicos. Runtime/Edge atual não foi alterado nem implantado.
- `test_pg.py`, `pg-result.json`, `test_assembly.py`: testes descartáveis e de montagem.
- Frontend: `src/lib/productStructuredDossier.ts`, `src/hooks/useStructuredProductDossier.ts`, `src/components/fiscal/ProductStructuredDossierEditor.tsx`; integrações em `ProductDossierManagement.tsx`, `DossierDocumentViewer.tsx`, `useProductDossierManagement.ts`, `useProductRegulatoryDossiers.ts`, `ProductTechnicalProfileDialog.tsx`.
- `src/test/fiscal/productStructuredDossier.test.tsx`: transporte SDK verdadeiro com rede sintética, CAS/uncertain/replay/escopo/reabertura QA.

## Entradas locais do builder
Captura: `{ "ref": "<ref explícito>", "provenance": "root-local-exact-catalog", "catalog": <resultado JSON da capture-query> }`.
Pins: objeto `{ "<assinatura pg regprocedure>": "<MD5 exato revisado>" }` contendo targets e wrappers escolhidas pelo assembly, além de `platform_private.recorte_a_actor_fresh(text)`; lista `TARGETS` está em `build.py`. O catálogo inclui a cadeia mais ampla mesmo quando não modificada: PRE/POST verificam tudo.

```text
python3 assemble.py --ref <ref> --pre /caminho-root/pre.json --post /caminho-root/post.json --pins /caminho-root/pins.json --output /caminho-root/02-install.sql.review
python3 build_document_edge.py --ref <ref> --output /caminho-root/edge-candidate
```

Refs aceitos explicitamente: produção canônica `swzpzcwiasxmjutrmvkm` ou HML `vrlcdwmlytukrjezrrnf`. Nenhum default. O agente NÃO executou operações em nenhum desses ambientes. Pré-requisitos ausentes devem ser instalados pelo root antes de NOVA captura PRE; nunca repinar silenciosamente um pacote antigo. Para `build.py` direto: `{ref,provenance,definitions:{signature:definition UTF-8 exata},pins:{signature:md5 revisado}}`.

## Gates e publicação
Instalação deixa gate OFF. Root prova primeiro instalação/deps/ACL/POST; ativação HML exige ação explícita revisada do root. Dossiê product-only não é submetido/aprovado/publicado por este delta; status/reviews permanecem DRAFT/PENDING e trigger nega aprovação inclusive via adapters antigos. Fiscal continua pendente e não existe wrapper fake de garantia fiscal. A implantação/validação das dependências full management, transporte privado, Auth A/B/anon e Realtime se publicado permanece tarefa root. Unizeb Gold já existente é fato relatado pelo root; não foi consultado ou modificado aqui.
