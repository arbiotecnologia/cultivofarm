# Correção pós-auditoria do módulo fiscal e infraestrutura

## Objetivo
Corrigir somente divergências comprovadas, preservar o banco real e o histórico do Cultivo Farm e preparar NF-e/NFS-e para homologação controlada. Produção, transmissão real e projetos antigos permanecem bloqueados.

## Regras de execução
- Usar exclusivamente o projeto canônico `swzpzcwiasxmjutrmvkm`; qualquer alvo ausente ou divergente interrompe a operação antes de criar clientes ou executar SQL.
- Não usar o banco gerenciado vinculado ao projeto Lovable, pois o destino informado pela plataforma é proibido.
- Não apagar dados, recriar banco, reaplicar migrations históricas em massa, fazer backfill ambíguo ou alterar documentos emitidos.
- Toda mudança remota será uma migration nova, pequena, versionada, idempotente quando possível, com rollback lógico e guarda canônica.
- Não transmitir NF-e/NFS-e, não habilitar produção e não declarar aptidão sem evidência ponta a ponta.
- Executar em fases numeradas, com registro de evidências e checkpoint antes da fase remota seguinte.

## Fase 0 — Baseline e auditoria pré-alteração
- Validar o host/ref canônico em modo somente leitura antes de qualquer consulta remota.
- Comparar migrations locais com `supabase_migrations.schema_migrations`, incluindo H12 e as duas migrations aplicadas externamente.
- Inventariar RPCs/funções fiscais, assinaturas, corpos e ACLs; RLS/policies/grants; índices/triggers; buckets/policies fiscais; configurações e vínculos de certificado; documentos/XMLs por metadados, sem ler segredos.
- Separar no relatório: código local, implantado, migration aplicada/não aplicada e divergências banco × repositório.
- Confirmar o marcador canônico `STAGING` e `production_emission_allowed=false`.

## Fase 1 — Identidade e referências executáveis
- Consolidar `Cultivo Farm`, `Tecnologia que cultiva resultados` e nome curto em configuração reutilizável onde houver hardcodes realmente ativos.
- Corrigir título, metadata, PWA e superfícies visíveis somente quando divergentes; preservar nomes históricos em migrations, auditorias, logs e documentos emitidos.
- Remover refs proibidos de Edge Functions, scripts operacionais, runners, harnesses e testes ativos; substituir guards antigos por fail-closed canônico.
- Manter referências antigas apenas em evidências históricas claramente não executáveis.

## Fase 2 — Hardening SQL comprovado
- Criar migration nova após reler ACLs reais, sem revogação global.
- Reafirmar `REVOKE/GRANT` explícitos de `rpc_fiscal_tax_preview_v1` e `rpc_fiscal_calculate_invoice_v1` e corrigir somente demais diferenças comprovadas.
- Auditar cada `SECURITY DEFINER`, especialmente transmissão, retorno, certificado, autorização e suporte RTC: `search_path` fixo, validação de ator/perfil/tenant e menor privilégio.
- Remover `anon` de `fn_fiscal_rtc_layout_supported_v1` se a ACL remota confirmar exposição indevida.
- Preservar RLS e grants necessários do Data API; toda tabela nova, se inevitável, receberá grants mínimos antes de RLS/policies.
- Corrigir o registro de retorno para preservar o retorno SEFAZ mesmo quando o fechamento documental falhar, marcando reconciliação pendente em vez de perder a transação.

## Fase 3 — Fechamento NF-e e `nfeProc`
- Implementar montagem server-side idempotente de `nfeProc` a partir do XML assinado correspondente e do protocolo autorizado validado.
- Validar nota, chave de acesso, ambiente, protocolo, transmissão e hash antes de persistir.
- Armazenar o XML protocolado no bucket fiscal, registrar documento/path/hash/protocolo/data e vincular `fiscal_invoices.xml_document_id` somente após persistência confirmada.
- Manter autorização já recebida e `reconciliation_status=PENDING` se Storage/documento falhar; nunca reenviar por essa falha.
- Tornar a recuperação/reconciliação repetível e segura, sem duplicar documento ou protocolo.

## Fase 4 — Conciliação pós-timeout e concorrência
- Consolidar `SENT → PENDING/UNKNOWN → consulta por recibo/chave → resultado confirmado`.
- Exigir consulta antes de novo envio quando o POST puder ter chegado à SEFAZ.
- Bloquear duplo clique, retries concorrentes e retransmissão de nota já autorizada com idempotência e estado persistido.
- Distinguir transporte, processamento, rejeição fiscal, autorização e reconciliação pendente em contratos e respostas.

## Fase 5 — Edge Functions fiscais
- Auditar e corrigir `fiscal-xml-engine` e `fiscal-sefaz-transport`: JWT, CORS, payload, autorização, vínculo emitente/nota, certificado, Storage, XSD, idempotência, timeout e guarda canônica antes dos clientes.
- Adicionar configuração explícita `verify_jwt=true` ao transporte sem alterar configurações globais; preservar `static_files` dos XSDs do motor XML.
- Implantar somente se a ferramenta comprovar o ref canônico antes do deploy. O canal gerenciado atualmente conhecido não será usado.
- Após implantação: confirmar `ACTIVE`, versão e executar apenas smoke autenticado sem transmissão; `NFeStatusServico4` fica reservado para a fase de homologação controlada autorizada.

## Fase 6 — Cálculos e certificados
- Ampliar testes da totalização NF-e para produto, desconto, frete, seguro, outras despesas, IPI, ST, FCP-ST, combinações e centavos; preservar total comercial e `FISCAL_TOTAL_MISMATCH`.
- Cobrir certificado por emitente: vínculo de empresa/CNPJ/ambiente/status/validade, zero/um/múltiplos certificados e ausência de material; nenhum segredo chega ao cliente.
- Cobrir payloads inválidos de retenções NFS-e e confirmar snapshots imutáveis, vigência, perfil e auditoria.
- Manter o motor próprio `rpc_fiscal_calculate_service_invoice_v1`; exibir “Cálculo fiscal disponível” e “Emissão nacional ainda não habilitada”.
- Manter IBS/CBS fail-closed sem alíquota universal ou XML até leiaute, versão, XSD, vigência, CST e cClassTrib oficiais estarem validados.

## Fase 7 — UI/UX fiscal
- Auditar as telas existentes, sem criar fluxo ou rota paralela.
- Representar claramente rascunho, calculando, pronto, assinado, enviado, processando, autorizado, rejeitado, falha de transporte, conciliação pendente e cancelado.
- Nunca apresentar sucesso antes da persistência final; erro de transporte não será exibido como rejeição fiscal.
- Garantir reabertura da NFS-e salva e recuperação de NF-e pendente de conciliação.

## Fase 8 — Baseline de migrations
- Inventariar migrations locais/aplicadas, órfãs, duplicadas, absorvidas e com refs antigas.
- Produzir proposta de baseline/squash para reconstrução futura, sem apagar arquivos nem alterar o banco atual.
- Isolar scripts/harnesses antigos para impedir execução acidental contra projetos proibidos.

## Fase 9 — Validação e homologação controlada
- Executar testes unitários, fiscais completos, integração local, contratos SQL, RLS/ACL, Edge Functions, certificado, idempotência, autorização, `nfeProc`, timeout, NFS-e e IBS/CBS fail-closed.
- Incluir cenários negativos: sem permissão, empresa divergente, certificado ausente/ambíguo, nota autorizada, clique duplo, timeout/resposta tardia, Storage indisponível, XML inválido, ref incorreto e produção bloqueada.
- Rodar typecheck, lint focado e global registrando dívidas preexistentes, build e verificação visual das telas afetadas.
- Somente após todas as evidências e nova autorização: executar `NFeStatusServico4` em homologação. Nenhuma nota será transmitida nesta execução.

## Relatório e aceite
- Criar `docs/auditorias/cultivo-farm-fiscal-correcao-final.md` com estado inicial, alterações, migrations/RPCs/functions, implantação e versões, ACL/RLS/grants, índices/triggers/Storage, testes/contagens, falhas, riscos, rollback e situação de NF-e, NFS-e, IBS/CBS, certificados e migrations.
- Registrar explicitamente tudo que permaneceu bloqueado por validação externa ou acesso indisponível.
- Confirmar ao final que a emissão fiscal de produção continua bloqueada.
- Considerar concluído apenas o subconjunto comprovado; ausência de deploy, certificado, endpoint oficial ou E2E mantém o veredito parcial e fail-closed.
