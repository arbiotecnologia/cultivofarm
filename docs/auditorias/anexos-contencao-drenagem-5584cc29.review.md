# Contenção e drenagem server-side — revisão 5584cc29

**NO-GO, candidato documental; nenhum SQL/deploy/policy alterado.**
Gate Blob e cache false. Marca/arquivos públicos de branding fora do recorte.

## Inventário mínimo de emissores privados ainda ativos no código

| Emissor | TTL observado (segundos) |
|---|---:|
| ClienteDocumentosTab branch legado | 60 |
| OrderMessagesPanel → useCommercial | 3600 |
| useSignedUrls legado/consumidores | 3600 |
| ConfirmacaoEntregaPanel | 60 |
| EntregaComprovantePanel | 300 |
| financeiro/DocumentosPanel | 300 |
| financeiro/relatorios/HistoricoExportacoes | 3600 |
| pdfAplicacao | 600 |
| Edge generate-financial-report/receipt | 3600 |
| Edge fiscal-xml-engine | 120 |
| Edge entrega-termo-pdf | 120 |

Inventário não prova TTL histórico máximo, policies Storage, exposição de PDFs
persistidos/embeds, caches ou todas as versões antigas. ReportShell e chamadas
RPC extraídas continuam fora do delta autorizado; não foi feita correção lateral.

## Ordem obrigatória antes de T0

1. Capturar configuração Storage real e policies/buckets privados e todos os
   emissores Edge, RPC/PDF/email, registros persistidos de URL e caches. Usar
   exclusivamente ambiente canônico; não buscar tokens nem URLs privadas nos logs.
2. Desenhar contenção no servidor que distinga emissão signed de download
   autenticado sob actor/tenant canônicos. **Revogar SELECT genericamente é
   inválido**, pois pode impedir também o download autenticado. Não presumir
   helper de operação Storage sem provar suporte/semântica no ambiente real.
3. Fechar emissores service-role de Edges no próprio servidor: RLS de usuários
   não restringe service-role. Retornar somente resultado autenticado aprovado;
   preservar isolamento e receiver canônico, sem novo cliente paralelo.
4. Ensaiar rollback/transação e testes HTTP reais: cliente antigo tentando
   Storage signing endpoint recebe negativa; cliente atual consegue download
   autenticado somente do escopo permitido; outro tenant/ator pendente negado;
   serviço antigo não consegue emitir; branding público segue legível.
5. Só iniciar T0 após readback de todas as contenções aplicadas pelo auditor,
   ausência demonstrada de emissão por clientes antigos/abas antigas e captura
   do último horário de emissão. Atualização de UI/publicação NÃO satisfaz isso.

## Janela e verificação

T0 permanece **indefinido**. Calcular término como último instante comprovado
de emissão + maior TTL real/histórico permitido + margem de clock/cache
homologada. Os 3600s observados no código são piso de investigação, não prova
de máximo nem prazo de liberação. Cada nova emissão reinicia investigação/T0.
Verificar tokens antigos fora de cache na API real após término; nenhum token
privado deve entrar em relatório, screenshot ou logs compartilhados.

Não prometer revogar bytes já baixados, screenshots nem cópias locais. Blob
revocation/abort só fecha acesso local da instância; não invalida signed tokens
emitidos. Clientes antigos capazes de novas emissões tornam drenagem infinita.

## Rollback e blockers

Se containment falhar: manter gates false, preservar dados e branding; rollback
somente de objetos exatos com hash/ACL arquivados, não reabrir emissão privada
automaticamente. Implementação server-side executável depende contratos
Storage/provedores live, inventário completo e auditoria de rollback. Nesta
rodada apenas candidato e testes simulados, nenhuma contenção remota provada.

## Adendo v6 — SQL revisável por operação

`scripts/authz-cache/storage-operation-containment.sql.review` e rollback fora
de migrations: policy SELECT RESTRICTIVE AND regras existentes para buckets
privados inventariados. Allowlist `get_authenticated`, list/list_v2 e info
autenticada; signing/sign_many/render.image_sign e contexto ausente negados.
Não confia em versão de cliente, não cria autorização tenant paralela e não
altera função/tabela/trigger de schema reservado. Políticas Storage são o alvo.

Fontes públicas consultadas nesta rodada:
- https://supabase.com/docs/guides/storage/schema/helper-functions
- https://github.com/supabase/storage/blob/master/src/http/routes/operations.ts

`storage.allow_any_operation(text[])` é documentado (normaliza prefixo storage,
match exato, contexto ausente false). Adendos 12:49/12:52 forneceram corpo/hash/proacl/owner e manifest 33 policies/11 buckets; ver anexos-manifest-1252-20261017.review.md. Preflight tem hash helper conhecido e hash de serialização das policies NULL; aborta também por order-attachments/entrega-termos ausentes. Não é instalável. storage.operation(), grants efetivos e testes HTTP ainda faltam.
Allowlist precisa ensaio de copy/move/updates que possam consumir SELECT antes
de liberação, sem abrir signing como efeito colateral. Policies permissivas
existentes não contornam uma restrictive correta; grants/roles/BYPASSRLS e
buckets dinâmicos precisam revisão.

**service-role não é contido por RLS.** generate-financial-report,
generate-financial-receipt, entrega-termo-pdf e fiscal-xml-engine ainda emitem:
política acima não resolve Edges antigas. Precisam candidato de retirada de
signing em cada ramo atual/replay/cache e retorno autenticado, com receiver/
guards preservados; não alteradas nesta rodada para evitar deploy automático.
Buckets de runs/exportações podem ser dinâmicos; não presumir só defaults.
T0 permanece indefinido até negativas HTTP reais e última emissão comprovada.