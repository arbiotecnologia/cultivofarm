# Homologação XML e inventário legado — somente preparação

## Fixture pelo fluxo existente
O caminho é rascunho NF-e salvo → tributos/numeração reservada → invoice
autorizada → `rpc_fiscal_xml_prepare_v1` → montagem/precheck → Storage do XML
unsigned → `rpc_fiscal_xml_record_v1(GENERATED)` → resolução do A1 → assinatura.
Referências: `supabase/functions/fiscal-xml-engine/index.ts`, ações generate;
`supabase/migrations/20260822000000_fase_f4_motor_xml_nfe.sql`;
`src/components/fiscal/documentos/GeracaoXmlNfeSecao.tsx`.

Não existe ação canônica “criar fixture sem efeitos”. `generate` grava execução
e artefato unsigned, mesmo se depois retorna 412 CERTIFICATE_REQUIRED. Ausência
de certificado não autoriza gerar/assinar nem simular SIGNED. O gate UI
F4_1_RUNTIME_CERTIFIED permanece false. `xsd-selftest` valida XML fixo inválido
sem banco/Storage, mas NÃO cria execução/download para homologação.

Bloqueio específico: zero fiscal_xml_runs reportado pelo proprietário; nenhum
documento sintético autorizado com numeração/tributos e artefato gerado pelo
fluxo revisado. Sem certificado real, signed não é possível pelo contrato atual.
Unsigned pode ser produzido antes de 412 somente numa etapa futura autorizada,
auditando todo generate e sem abrir gate ou inserir fiscal_xml_runs diretamente.
Nenhuma fixture, certificado, emissão, SEFAZ, arquivo ou numeração foi alterada.
Assim, 22/14 testes simulados são prova local de transporte/fences, não E2E LIVE.

## Inventário financial-receipts sem tokens
Plano READ-ONLY, NÃO executado nesta rodada:
1. Validar ref exato swzpzcwiasxmjutrmvkm e janela temporal UTC.
2. Enumerar via consulta autorizada locators de recibos e metadados do bucket,
   incluindo path histórico ISSUED e `.canceled.pdf`; paginar para não cortar 1000.
   Produzir tabela restrita: recibo, organização, status, path, hash/tamanho e
   updated_at. Não ler conteúdo PDF, JWT, URL inteira ou token.
3. Capturar fonte/versões reais dos emissores antigos, TTL usado e último instante
   verificável em que assinatura ainda foi permitida (Edge/service e Storage).
   A última publicação frontend NÃO é T0 server-side. Timestamp de upload NÃO
   é timestamp de assinatura. Valores 120s de XML não se aplicam a recibos;
   o histórico de 3600s necessita conferência por versão de emissor e logs.
4. Logs precisam projetar somente path normalizado, horário e resultado de sign,
   nunca querystring/Authorization. Logs ausentes não provam zero emissões.
   Expiração verificável = assinatura conhecida + TTL conhecido. Um cutoff global
   só é demonstrável com todos emissores bloqueados e maior TTL provado. Caso
   falte emissão/T0/TTL, registrar horizonte UNKNOWN, sem afirmar drenagem.
5. Se o proprietário já possuir links, extrair exp/iat localmente em ambiente
   autorizado sem persistir token/URL, lembrando que decodificar JWT não valida
   assinatura. Registrar só expiração/objeto e testar após expiração sem gerar URL
   nova; redigir logs antes de guardá-los. Não recolher tokens pelo chat.

## Invalidação suportada e preservação histórica
Supabase documenta TTL fixo de signed URL e delete via Storage API (não SQL):
- https://supabase.com/docs/reference/javascript/storage-from-createsignedurl
- https://supabase.com/docs/guides/storage/management/delete-objects
- https://supabase.com/docs/guides/storage/cdn/smart-cdn

Não foi identificada nesta integração API suportada de revogação individual do
token já emitido. Alterar RLS/locator/cancelamento não invalida capacidade antiga.
Remover objeto original pela Storage API pode cortar a origem, mas implica
destruição e propagação CDN (documentação: até 60s) e cache navegador ainda pode
persistir. Logo NÃO é opção implementável nesta rodada (preservar histórico,
sem apagar objetos nem rotacionar chaves). Bytes já baixados não são revogáveis.

Opção conservadora: bloquear emissão nova, preservar objetos e aguardar expiração
com horizonte provado; cache continua risco residual explícito. Se for exigido
corte antecipado, solicitar ao provedor mecanismo suportado de purge/revogação
com verificação de CDN/origem/navegador, sem implementar enquanto não comprovado.
SU-518022 segue apenas ack; nenhum chamado novo foi enviado.

Mover/copiar arquivo sozinho não revoga a URL antiga. Qualquer proposta futura
de arquivo protegido deve provar integridade, locators/histórico, backup e cache
e obter autorização específica antes de mover, copiar ou remover o original.