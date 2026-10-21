# Inventário completo dos consumidores de leitura no checkout

Busca recursiva em `src` e `supabase/functions`, excluídos apenas testes e tipos gerados; evidências brutas locais em `evidence/consumer-scan.txt` e `evidence/storage-read-scan.txt`. A existência do bucket/objetos e autorização REAL não são inferidas de strings.

| Bucket / canal | Consumidores e estado |
|---|---|
| consultor-arquivos — GET autenticado pelo transporte compartilhado | `ConsultorTecnico`, `EvidenciasTabs`, `RoteiroVisita`, `WizardAnexosStep`, `HistoricoTalhao`, `MobileTalhaoHistorico`, `TimelineAtendimento`, `SolicitacaoDetalheTabs`; `pdfVisita` e leitores de evidências via `useSignedUrls`→`useAuthenticatedBlobUrls`. O nome legado não emite assinatura. Candidata POST limitada à referência de visita canônica. Solicitações/checkins fora do guard são bloqueios explícitos. |
| aplicacao-evidencias — GET autenticado | `EvidenciasGallery`, evidências herdadas de `AplicacaoFormDialog`, `pdfAplicacao`. Prova deve preservar origem de retificação/aplicação/OS; não atendida pelo snapshot de visita. |
| entrega-documentos — GET autenticado | `EntregaComprovantePanel`, `ConfirmacaoEntregaPanel`, `comprovanteLocator`/`anexoComprovante`. Prioridade seguinte para comprovantes técnicos, contrato próprio ainda não comprovado nesta rodada. |
| financial-receipts — GET autenticado | `RecibosList`, `EmitirReciboButton`; geração/rechecks e opener já existentes não impedem reaproveitamento do GET histórico/CDN. Não alterados. |
| financial-reports — GET autenticado | `ReportShell`, `HistoricoExportacoes`, locator validado. Necessita snapshot próprio de exportação + staff/tenant/status; não alterado. |
| order-attachments — GET autenticado | `OrderMessagesPanel` previews e downloads; bucket anteriormente reportado inexistente/zero objetos, não recriado. Não presumir disponibilidade ou autorização. |
| clientes-docs — POST | `ClienteDocumentosTab`, `clienteDocumentos`/ZIP pelo canal compartilhado; preservado v3/JWT=true. Origin deny não invalida CDN legado. |
| financial-docs — POST | `DocumentosPanel`, comprovantes de baixa pelo canal compartilhado. Remoção lógica e A/B reais homologados externamente, não aceite global. |
| entrega-termos — POST específico | `TermoEntregaPanel` com loader `downloadTermoPdf`; Edge `entrega-termo-pdf` ainda lê bytes internamente e possui caminho de reuso do PDF existente. Preservar contrato específico, não redirecionar pelo técnico. |
| fiscal-xml — POST específico | `GeracaoXmlNfeSecao`/`useFiscalXmlEngine` custom loader; servidor realiza GET interno como canal de bytes. XML estável preservado, geração/assinatura/certificados/SEFAZ intocados. |
| visitas-pdf | Coberto pela policy global de fechamento de capacidades; nenhum leitor Storage direto encontrado no checkout atual. Provar writers/objetos/histórico LIVE antes de concluir que está encerrado. |
| logos — público deliberado | `AparenciaTab`, `PortalBrandingSettings`, imagem de marca em PDF. Não é anexo privado; não aplicar o snapshot/deny técnico. |

## Leitores exclusivamente servidores — não confundir com GET do browser
`download-client-document`, `download-financial-document`, `entrega-termo-pdf`, `fiscal-xml-engine`; `fiscal-event-sign` e `fiscal-sefaz-transport` leem certificados/XML internamente. Não modificados. Um segredo server-only não autoriza documento sem prova do ator.

## Legado de URLs
`arquivo_url` ainda existe em tipos/consultas/eventos e histórico, mas os renders auditados usam paths→Blob, sem fallback para essa coluna. Não remover/backfill histórico. A indexação paralela fotos/path em históricos merece revisão de associação separada; não é prova de canal autorizado. Busca não achou `createSignedUrl/createSignedUrls` ativo em `src` ou funções atuais. Nenhuma dessas ausências revoga capacidades antigas.