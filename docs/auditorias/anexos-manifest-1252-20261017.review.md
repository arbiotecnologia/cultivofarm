# Anexos — manifest 12:52, revisão sem liberação

## Evidência e achado funcional

Auditor forneceu 33 policies em storage.objects, RLS enabled=true/forced=false e 11 buckets. Não são testes de transporte. Sete `any` dos dois componentes já corrigidos no delta 12:49: 58/58 testes locais (27 consumidores/ownership/form +31 cache) e lint focal zero; os resultados 0426/scan4241/typecheck/25 independentes são do auditor, não rerodados nesta rodada.

| Bucket informado | Public |
|---|---|
| entrega-documentos | false |
| aplicacao-evidencias | false |
| visitas-pdf | false |
| logos | true |
| fiscal-xml | false |
| fiscal-certificates | false |
| financial-docs | false |
| financial-reports | false |
| financial-receipts | false |
| clientes-docs | false |
| consultor-arquivos | false |

**order-attachments e entrega-termos ausentes**. Não criar bucket permissivo, substituir por financial-docs/entrega-documentos ou retirar destinos do preflight para afirmar prontidão. Nenhum upload/download/sign hospedado realizado; nenhuma conclusão sobre objetos históricos não inventariados.

## Fluxo de mensagens: plano mínimo, antes de liberar

- `src/hooks/useCommercial.ts` useUploadMessageAttachment escreve `order-attachments`, path `${order_id}/${message_id}/${timestamp}-${file.name}`; só getUser antes do upload e metadata insert depois. Falta provar relação message→order→partner/tenant/ator no Storage. Se metadata insert falhar após upload, não há compensação neste caminho. Isso é diagnóstico, não alteração de dados.
- getAttachmentSignedUrl assina no mesmo bucket por 3600s, erro retorna null. OrderMessagesPanel usa esse helper no legado; candidata Blob também aponta ao destino ausente. UI mockada não detecta ausência real do bucket.
- Primeiro capturar esquema/constraints/ACL/RLS de `partner_order_message_attachments`, `partner_order_messages`, `partner_orders` e guards canônicos para leitura/escrita do pedido com exclusão financeira do técnico. Não duplicar política de autorização em checks frontend.
- Candidata futura: destino privado explícito com path tenant/order/message/identificador validado pelo servidor, regras SELECT/INSERT/DELETE (UPDATE somente se comprovadamente necessário) verificando associação e proprietário canônicos antes da operação. Toda criação de bucket dependerá recorte específico/Storage API e revisão RLS; **nada criado aqui**.
- Preservar metadata/path/objetos históricos; inventariar referências por leitura agregada autorizada, sem remapear silenciosamente. Plano de compensação e idempotência upload/metadata, arquivo/tamanho/MIME e testes negativas intertenant/role/links pendentes. Assinar bloqueado por operação antes de Blob gate; download autenticado limitado pelo mesmo RLS. Não liberar Anexar por teste simulado.

## Termos de entrega

`supabase/functions/entrega-termo-pdf/index.ts`: destino entrega-termos; signed_url 120s; generate/replay baixam ou geram snapshot, validam hash e persistem path. Termo cancelado/substituído/não assinado negado no corpo observado. Bucket ausente bloqueia também geração; não redirecionar para entrega-documentos, que tem paths/policies diferentes. Auditoria de actor/tenant/termo e schema/policies precede qualquer candidato de bucket/RLS; preservar snapshots/hashes históricos.

## Manifest de policies: não presumir isolamento

- Clientes-docs delega a `cliente_storage_object_permitted(text)`; financeiro a `financial_storage_object_permitted(text,text)`. Capturar corpos/ACL/volatilidade e closure atuais.
- Entrega/aplicação/consultor recebem camada RESTRICTIVE storage1 além permissivas. Necessários `platform_private.storage1_delivery_allowed(text,text)`, `storage1_application_allowed(text,text)`, `storage1_consultor_core(text,text)` e os helpers staff/aplicação. Não remover essas regras.
- `consultor-arquivos` permissiva verifica org e conjunto de roles; sem concluir acesso por vínculo individual somente dessa permissiva. RESTRICTIVE pode conter; corpo real necessário.
- No pacote não há policy explícita visitas-pdf/fiscal-certificates/fiscal-xml; helper financeiro genérico pode ou não admiti-los. Privado não implica seguro, e ausência de policy explícita não prova emissão service-role bloqueada.
- Logos público permanece intocado; este recorte não altera branding. `storage.operation()`, grants/ACL efetivos e semântica HTTP ainda não comprovados. Manifest recebido não inclui hash da serialização SQL usada no preflight; não fabricar hash a partir de JSON formatado.

## Contenção service-role: requisito obrigatório

RLS authenticated/anon não bloqueia `generate-financial-report`, `generate-financial-receipt`, `fiscal-xml-engine`, `entrega-termo-pdf` nem qualquer serviço antigo BYPASSRLS. Candidata de Edge deve negar explicitamente emissão signed em **todos** ramos (action signed_url, generate, replay, cache) antes de createSignedUrl e antes de retornar URL persistida; manter autorização canônica do chamador. Download autenticado deve continuar separado e escopado, nunca entregar certificado/segredo ao browser. Não usar versão enviada pelo cliente como autorização.

Antes de T0: auditor instala contenção aprovada + retira serviços legados + readback e negativas HTTP reais de old signing endpoints; testa download autorizado e negativas intertenant/pendente, preserva logos; comprova última emissão/TTL histórico. Nenhum desses testes declarado PASS aqui. T0 **indefinido**, bytes já baixados não revogáveis.

## Visitas e certificados: relevância inventariada

- `visitas-pdf`: bucket privado live, mas nenhuma referência literal em src/ ou supabase/functions encontrada. `src/components/visita/EnviarPdfVisitaDialog.tsx` gera PDF local e chama `enviar-pdf-visita`; não prova uso desse bucket. Migrations antigas contêm policies de papéis amplas, **ausentes no manifest live recebido**: não tratá-las como vigentes nem afirmar segurança por histórico. Necessários inventário de objetos/refs persistidas/serviços externos por leitura autorizada e operação/ACL real. Não abrir leitura ou adicionar à allowlist de downloads apenas por ser privado.
- `fiscal-certificates`: `fiscal-certificate-upload` grava ciphertext via admin Storage; `fiscal-event-sign`, `fiscal-xml-engine`, `fiscal-sefaz-transport` baixam material exclusivamente server-side; `fiscal-certificate-revoke` remove. Nenhum emissor de signed URL desse bucket localizado. Isso é inventário de fonte, não auditoria universal de serviços instalados. **Nunca transformá-lo em Blob/download de portal**; manter isolamento e autorização fiscal canônica, sem tocar cofre/segredos. Falta provar que permissiva financeira genérica não admite esse bucket via `financial_storage_object_permitted(text,text)` e ACL efetiva.
- Policies de order-attachments encontradas em migrations históricas não aparecem no manifest live e o bucket live inexiste: não inferir autorização vigente nem preservar policy histórica ampla como baseline aprovado.
- Entrega-termo valida acesso com JWT/RLS antes do cliente admin; isso não contém criação signed via service-role. TTL curto não substitui retirada de emissão antes de T0. Não aceitar recomendação de manter URLs assinadas como solução de drenagem.

## Lacunas restantes exatas e validações

Manifest/FKs/índices recebidos eliminam a pendência genérica desses pacotes. Permanecem: `storage.operation()`/grants; `cliente_storage_object_permitted(text)`, `financial_storage_object_permitted(text,text)`, helpers storage1 citados; schema/ACL/RLS de messages/attachments/orders; catálogo das filhas/tickets privados; corpos dos demais writers enumerados em v6-writers-catalog.review.md, com seis recebidos excluídos; provas locks duas conexões/tempo. Sem novo harness com stubs.

Delta 12:52 é documental/preflight: nenhum runtime alterado nem novo teste HTTP/browser/SQL DML alegado. diff-check zero; log automático de prévia build OK 12:53:58 UTC. Testes 58/58 e lint zero são do delta imediatamente anterior de tipagem, não resultados hosted nem nova rerodada aqui. Os gates permanecem false e o preflight rejeita corretamente buckets ausentes.