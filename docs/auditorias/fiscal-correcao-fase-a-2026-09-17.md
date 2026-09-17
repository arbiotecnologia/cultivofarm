# Fase A — evidência remota canônica

- Ref validado: `swzpzcwiasxmjutrmvkm`; host direto validado antes da conexão; PostgreSQL 17.6; transação read_only=on.
- Inspeção somente de metadados: 116 funções fiscais, 30 tabelas, 760 colunas, 59 políticas, 98 índices e 44 triggers; nenhuma leitura de material de certificado ou dados de notas.
- Todas as 30 tabelas inventariadas têm RLS habilitada; isso não prova isolamento correto de todas as políticas.
- Cinco registros de migrations relevantes encontrados (20261029–20261033); objetos anteriores existem sem correspondência demonstrada no histórico consultado.

## Divergências confirmadas antes de alterações
- Cálculo definitivo rejeita NFS-e; preview não verifica modelo; helper não constitui cálculo próprio de serviços.
- Total do rascunho ainda é comparado ao tributado com erro FISCAL_TOTAL_MISMATCH.
- IBS/CBS/IS explicitamente bloqueados no aplicador.
- begin de transporte ainda exige referência antiga proibida.
- Achado crítico: record de retorno é SECURITY DEFINER, permite EXECUTE a authenticated e não valida auth.uid()/perfil em seu corpo; usuário autenticado poderia invocá-lo diretamente se souber o identificador. Não explorado nem alterado remotamente.
- Corpo record reconcilia eventos, mas não fecha autorização da nota/nfeProc.

## Alterações locais nesta rodada
- fiscal-sefaz-transport: guard canônico antes de clientes; corpo JSON validado; confirmação de SENT obrigatória antes do POST; falhas posteriores retornam conciliação necessária, authorized=false e retrySafe=false; timeout preserva estado SENT.
- Hook/painel: SERVICE_INFO reconhecido.
- Migration nova 20261034000000_fiscal_transport_preview_safety.sql: revoga escrita técnica de retorno de authenticated; bloqueia preview NFSE. NÃO APLICADA.
- Rollback do preview em restoration/fiscal-reducao-base; não restaura privilégio inseguro.

## Validações e bloqueios
- 54 testes locais aprovados em quatro arquivos; cinco novos testes são contratos estáticos, não execução remota da Edge.
- Log automático: build OK às 04:16:11 UTC; typecheck separado, lint e smoke autenticado não executados nesta rodada.
- Nenhuma migration remota, deploy, transmissão ou alteração de RLS/grants/índices foi executada.
- Ferramenta obrigatória de migrations não permite selecionar projeto e permanece vinculada ao destino proibido informado na sessão; não foi invocada. A conexão direta não muda esse vínculo.
- Fase A parcial: inventário e achados confirmados; comparação integral de cada política/índice/trigger ainda pendente.
- Fases B–D parciais/bloqueadas: totalização, certificado por emitente, conciliação/XML protocolado, serviços e IBS/CBS ainda não concluídos; contrato oficial/XSD por modelo não validado nesta rodada.
- Não apto à homologação ponta a ponta. Produção e transmissão continuam bloqueadas.

## Impressões digitais das definições remotas auditadas
- `rpc_fiscal_tax_preview_v1`: SHA-256 `62f73e9dd3209c191033b0a7f3499b84a3164e162a0e8edc1be4e4c27b830c35`
- `rpc_fiscal_calculate_invoice_v1`: SHA-256 `a6b77aea462833fa49ce09f866c7f02a76a64d088c4926ebd9757091bc8abd79`
- `rpc_fiscal_draft_save`: SHA-256 `dcb500df79dafe13ad19cddc6dca07e836fbae0335952715d214eeea5b6b7cd8`
- `fn_fiscal_apply_tax_v2`: SHA-256 `57016162f6e283cdaf9a6924654fe4e4f35eee63be90a21744c28ee204ef3334`
- `rpc_fiscal_sefaz_transmit_begin_v1`: SHA-256 `ed627648364b8ae4bf577c840e5f0a35c48c0e2bc15ad5a1f040df8cd6269e08`
- `rpc_fiscal_sefaz_transmit_record_v1`: SHA-256 `dd7b77fae9fae354953c37efd1ac3bd9995440878f711d323f1cbe2461222226`
