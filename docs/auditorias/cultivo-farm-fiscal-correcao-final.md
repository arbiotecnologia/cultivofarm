# Cultivo Farm — correção pós-auditoria do módulo fiscal e infraestrutura

Data: 17/09/2026. Projeto canônico: `swzpzcwiasxmjutrmvkm` (PostgreSQL 17.6). Nenhuma nota foi transmitida; produção continua bloqueada.

## Estado inicial verificado

- Marcador fiscal canônico confirmado no banco: `swzpzcwiasxmjutrmvkm`, `STAGING`, `production_emission_allowed = false`.
- Ledger remoto mais recente antes desta rodada: `20261035000000` (H12) e anteriores.
- Catálogo de leiaute RTC vazio (`fiscal_rtc_layout_support` = 0 linhas) → IBS/CBS fail-closed.
- Falhas reais encontradas nas ACLs implantadas: `fn_fiscal_rtc_layout_supported_v1` e `fn_fiscal_service_withholding_valid_v1` concediam EXECUTE a `anon`.
- `fiscal-sefaz-transport` respondia `200` a preflight de origem fora da allowlist, divergindo do motor XML.
- URL canônica duplicada como literal em duas Edge Functions, sem contrato que impedisse divergência.
- `fiscal-xml-engine` delegava 100% da autorização às RPCs, sem checagem de perfil na borda.
- Registro do retorno SEFAZ perdia a transação inteira se o fechamento documental falhasse.

## Alterações aplicadas

### Banco (migration nova, aplicada no canônico)
`restoration/fiscal-h13/20261036000000_h13_fiscal_acl_and_authorization_resilience.sql`, registrada no ledger como `20261036000000`:

- Guarda canônica no início; ensaio prévio em transação revertida antes da aplicação real.
- `anon` removido de `fn_fiscal_rtc_layout_supported_v1` e `fn_fiscal_service_withholding_valid_v1`; EXECUTE mantido para `authenticated` e `service_role`.
- ACLs reafirmadas explicitamente para `rpc_fiscal_tax_preview_v1`, `rpc_fiscal_calculate_invoice_v1` e `rpc_fiscal_calculate_service_invoice_v1`.
- `rpc_fiscal_certificate_for_invoice_v1` e `rpc_fiscal_sefaz_transmit_record_v1` restritas a `service_role`.
- `rpc_fiscal_sefaz_transmit_record_v1` recriada: o retorno da SEFAZ é preservado mesmo se a reconciliação de evento ou o fechamento da autorização falhar; nesses casos grava `FISCAL_EVENT_RECONCILIATION_PENDING` ou `FISCAL_AUTHORIZATION_CLOSE_PENDING` e devolve `reconciliationPending`, sem afirmar sucesso e sem liberar reenvio.
- Rollback lógico em `restoration/fiscal-h13/ROLLBACK.sql` (não restaura privilégio inseguro de escrita técnica).

Pós-verificação de ACL no banco confirmou a ausência de `anon` nas seis funções auditadas.

### Código
- `supabase/functions/_shared/fiscal/canonicalProject.ts`: alvo canônico único compartilhado pelas Edge Functions fiscais.
- `fiscal-sefaz-transport`: preflight fora da allowlist agora responde 403; validação canônica via helper compartilhado.
- `fiscal-xml-engine`: validação canônica via helper e exigência explícita do perfil fiscal interno (`fn_fiscal_can_operate`) na borda, além das RPCs.
- `supabase/config.toml`: `verify_jwt = true` declarado explicitamente para `fiscal-sefaz-transport`; `static_files` dos XSDs preservado.
- `src/config/brand.ts`: nome, nome curto e slogan oficiais em fonte única.
- `index.html`: título, descrição e metadados sociais com o slogan oficial.
- `src/test/fiscal/transportPersistenceSafety.test.ts`: contratos ampliados para alvo canônico compartilhado, ausência de refs proibidos, preflight recusado, perfil fiscal na borda e `verify_jwt` declarado.

## Testes executados

- Suíte fiscal e de configuração: **1.814 aprovados, 4 pulados, 1 falha**.
- A única falha é o gate de vínculo que lê o `.env` gerado pela plataforma, apontando para o destino proibido `yzszlzjpovmcteuxjznj`. É exatamente o comportamento fail-closed esperado: o runtime da aplicação usa o cliente canônico literal, não esse arquivo.
- Regressão de segurança do transporte: 9 aprovados.
- Ensaio revertido da migration antes da aplicação: aprovado.

## Pendências (fail-closed, não contornadas)

1. **Implantação das Edge Functions:** o canal de deploy disponível está vinculado a um projeto proibido; `fiscal-xml-engine` e `fiscal-sefaz-transport` não foram publicados por esta rodada e continuam ausentes no canônico.
2. **`nfeProc`:** ainda não é montado nem armazenado; após autorização, a reconciliação permanece pendente.
3. **Conciliação pós-timeout:** o caminho `consult` existe na função, mas não há acionamento por tela nem rotina automática para transmissões presas em `SENT`.
4. **NFS-e nacional:** DPS, XML, XSD, assinatura, transmissão e consulta não validados; `nationalTransmissionSupported = false`.
5. **IBS/CBS:** sem leiaute homologado, sem cálculo e sem serialização; abrir apenas o gate não seria suficiente.
6. **Baseline de migrations:** inventário e proposta de squash ainda não produzidos; nenhum arquivo foi apagado.
7. **Scripts e harnesses históricos** ainda citam projetos antigos e precisam de isolamento antes de qualquer execução.
8. **E2E em homologação** não executado; `NFeStatusServico4` não foi disparado.

## Riscos

- Sem deploy comprovado, as correções das Edge Functions existem apenas no repositório.
- O `.env` gerenciado pela plataforma continua divergente, o que mantém o gate reprovando e impede verificação autenticada pela prévia.
- A resiliência do retorno reduz perda de dados, mas exige a rotina de reconciliação para fechar o ciclo.

## Situação por frente

- **NF-e:** cálculo, totalização, certificado por emitente e registro de retorno conformes; ciclo documental incompleto sem `nfeProc`.
- **NFS-e:** motor próprio preservado, cálculo disponível, emissão nacional bloqueada.
- **IBS/CBS:** fail-closed, sem alíquota universal.
- **Certificado:** vínculo por emitente, bloqueio em ausência e em ambiguidade, material nunca exposto.
- **Migrations:** H13 aplicada e registrada; histórico preservado.

**A emissão fiscal de produção continua bloqueada.** O sistema não está declarado apto ponta a ponta.


---

# Rodada H14 — fechamento documental da NF-e (nfeProc) — 17/09/2026

## Estado auditado (repositório x banco canônico)

- Banco canônico `swzpzcwiasxmjutrmvkm` confirmado no mesmo comando de leitura: marcador `STAGING`, `production_emission_allowed = false`.
- H13 (`20261036000000`) confirmada aplicada; **não** foi duplicada nem reexecutada.
- **Drift registrado:** os arquivos SQL da H13 e da H14 vivem em `restoration/fiscal-h13/` e `restoration/fiscal-h14/`, não em `supabase/migrations/`, porque a ferramenta de migrations do ambiente recusa escrita nesse diretório e só publica no projeto interno proibido. O ledger remoto recebeu as versões correspondentes.
- **Drift corrigido:** o bucket privado `fiscal-xml`, usado pelo motor de XML e pelo transporte, não existia no banco canônico. Criado nesta rodada (privado, 10 MiB, apenas XML).
- `fiscal-binding-diagnostics` estava correto: espera o ref canônico e trata `navf...` apenas como valor proibido, nunca como produção legítima.
- Branding ativo confere como **Cultivo Farm**; nenhuma renomeação para “Cultiva Farm” foi feita.

## O que já estava correto e foi preservado

- Guard canônico, JWT, checagem de operador fiscal, `service_role` apenas no servidor, gravação `SENT` antes do POST e timeout pós-POST como `reconciliationRequired` com `retrySafe=false`.
- `rpc_fiscal_sefaz_transmit_begin_v1` e `rpc_fiscal_sefaz_transmit_record_v1` seguem restritas a `service_role`.
- Resiliência H13: retorno autorizado preservado mesmo com falha de fechamento.
- NFS-e própria (`rpc_fiscal_calculate_service_invoice_v1`) e a separação de fluxos foram preservadas; nada de DPS/XML/transmissão nacional foi inventado.
- IBS/CBS continua fail-closed: `fiscal_rtc_layout_support` permanece sem leiaute suportado e nenhuma alíquota universal foi inserida.

## Arquivos alterados

- `supabase/functions/_shared/fiscal/nfe/nfeProc.ts` (novo): montagem e validação do `nfeProc`, path determinístico e hash.
- `supabase/functions/fiscal-sefaz-transport/index.ts`: fechamento documental idempotente após retorno autorizado.
- `supabase/functions/hml-b2b-runtime-harness/index.ts`: harness histórico desativado fail-closed (HTTP 410), pois criava usuários e dados reais e apontava para o staging antigo.
- `restoration/fiscal-h14/20261037000000_h14_nfeproc_document_closure.sql` e `restoration/fiscal-h14/ROLLBACK.sql` (novos).
- `src/test/fiscal/nfeProcClosure.test.ts` (novo, 18 testes).

## Migration nova e rollback

Migration `20261037000000_h14_nfeproc_document_closure`, ensaiada em transação revertida e depois aplicada e registrada no ledger canônico:

- bucket privado `fiscal-xml` garantido;
- tabela `public.fiscal_protocoled_documents` append-only, única por nota/chave/protocolo, com hash SHA-256, bytes, vínculo com a transmissão e o run assinado, e `environment_code` travado em `2`;
- `GRANT SELECT` para `authenticated` sob RLS com `fn_fiscal_can_operate(auth.uid())`; escrita apenas `service_role`;
- `rpc_fiscal_invoice_store_protocoled_xml_v1`, `SECURITY DEFINER`, **service_role-only** (verificado: `postgres=X service_role=X`).

Rollback: desativa somente o fechamento automático, mantendo tabela, bucket e artefatos. Nenhuma nota autorizada é rebaixada.

## Lógica do nfeProc

1. Recupera o `fiscal_xml_runs` `SIGNED` da nota, exigindo chave compatível, e baixa o XML assinado do bucket fiscal.
2. Usa o bloco `protNFe` da resposta da SEFAZ já persistida — conteúdo vindo do cliente nunca é aceito.
3. Valida assinatura presente, `Id="NFe<chave>"`, `chNFe`, `nProt`, `cStat` em 100/150 e `tpAmb=2` no documento e no protocolo; qualquer divergência falha fechado.
4. Grava em `fiscal-xml` com path determinístico `nfeproc/<invoice>/<chave>-<protocolo>.xml`; objeto já existente é tratado como replay, sem sobrescrever.
5. A RPC confere nota autorizada, chave coincidente e transmissão autorizada com o mesmo protocolo e ambiente antes de registrar.
6. Só então `reconciliation_status` passa a `RECONCILED`; hash, path, transmissão e run ficam auditados.
7. Replay do mesmo retorno é no-op; chave ou protocolo divergentes geram `FISCAL_PROTOCOLED_DOCUMENT_CONFLICT` com registro de conflito na auditoria.
8. Falha de Storage, de montagem ou de registro mantém `AUTHORIZED` + `reconciliation_status=PENDING`, marca a transmissão com o código de pendência e **nunca** reenvia a NF-e.

Observação: `fiscal_invoices.xml_document_id` referencia `financial_documents` e por isso **não** foi reaproveitado para o artefato fiscal; o vínculo oficial passou a ser `fiscal_protocoled_documents`.

## Reconciliação

Autorização direta e confirmação por consulta convergem para o mesmo fechamento idempotente. Depois de qualquer POST, a resposta jamais traz `retrySafe=true`; o duplo clique é barrado pela idempotência da abertura de transmissão e pelo índice único do artefato, de modo que nem transmissão nem artefato duplicam.

## Edge Functions — estado real

`fiscal-xml-engine` e `fiscal-sefaz-transport` estão **prontas para deploy e NÃO publicadas** no runtime canônico. O canal de publicação disponível aponta para projeto proibido, então nenhum deploy foi simulado. Ambas mantêm guard canônico, `verify_jwt = true` declarado para o transporte, produção bloqueada e `service_role` somente no servidor; os módulos relativos importados (`_shared/fiscal/...`, incluindo o novo `nfe/nfeProc.ts`) estão presentes e deployáveis.

## Testes

- Fiscal + configuração + segurança: **2.081 aprovados, 4 pulados, 1 falha**, sem nenhum skip novo.
- A falha é o gate que lê o `.env` gerado pela plataforma (`yzszlzjpovmcteuxjznj`): fail-closed correto e esperado; o aplicativo usa o cliente canônico literal.
- Novos testes do `nfeProc` (18): montagem, replay/path determinístico, conflito de chave, conflito de protocolo, retorno não autorizado, protocolo ausente, XML sem assinatura, bloqueio de produção, ACL da RPC, RLS da tabela, rollback sem destruição e harness desativado.
- Ensaio revertido da migration: aprovado. Typecheck: sem erros. Lint dos arquivos alterados: limpo. Build: OK.

## Pendências e riscos

1. Deploy real das duas Edge Functions no canônico — sem isso o fechamento `nfeProc` não roda em runtime.
2. E2E em homologação com certificado real e `NFeStatusServico4` não executado.
3. Consulta pós-timeout ainda não tem acionamento automático nem botão dedicado; a via `consult` existe e já converge para o fechamento.
4. NFS-e nacional (DPS/XML/XSD/transmissão) permanece sem contrato oficial validado.
5. IBS/CBS segue fail-closed por ausência de leiaute suportado.
6. Baseline/squash de migrations e isolamento dos scripts históricos continuam abertos.
7. O `.env` gerenciado pela plataforma continua divergente do projeto canônico.

## Confirmação final

`production_emission_allowed = false`, ambiente `STAGING`, endpoints restritos à homologação. **Nenhuma nota fiscal real foi transmitida nesta rodada.** O sistema **não** está declarado apto para produção nem homologado ponta a ponta.


## Correção pós-auditoria H14 — 17/09/2026 — somente repositório

### Evidência externa recebida
O proprietário confirmou diretamente no banco canônico: H14 no ledger, `RECONCILED` permitido pelo CHECK, bucket `fiscal-xml` privado/XML-only/10 MiB, tabela com RLS e zero linhas e RPC service_role-only. Esta rodada não realizou nova consulta nem alteração remota. `xml_document_id` não foi usado: sua FK referencia `financial_documents`; a tabela H14 permanece o vínculo fiscal adequado.

### Correções locais
- `protocoledStorage.ts`: classificação explícita de duplicidade; download obrigatório após colisão; SHA-256 dos bytes realmente armazenados e tamanho devem coincidir. Divergência retorna `FISCAL_PROTOCOLED_STORAGE_CONFLICT`; erro/ausência/leitura indisponível retorna `FISCAL_PROTOCOLED_STORAGE_VERIFY_FAILED`. O transporte retorna pendência antes da RPC, sem sobrescrever, sem reenvio e sem rebaixar AUTHORIZED.
- `nfeProc.ts`: reutiliza parser XML local para capturar declarações herdadas do SOAP e adicioná-las à raiz do protocolo. Preserva conteúdo oficial e NFe assinada literalmente; recusa prefixos indefinidos e protocolos ambíguos. Teste DOM do nfeProc completo confirma ausência de prefixos órfãos.
- Espelhos H13/H14 adicionados em `supabase/migrations/`, byte a byte iguais aos respectivos artefatos de `restoration/`. Drift destes dois arquivos resolvido; nenhum SQL foi executado, nenhuma migration foi reaplicada. Conteúdo histórico preservado sem alterações.
- `hml-b2b-runtime-harness/index.ts`: stub de OPTIONS/410, sem clientes, credenciais, referências antigas ou criação de dados. Nenhuma rotina histórica mutante permanece no entrypoint.

### Validação
- Focados: 29 testes aprovados nos dois arquivos H14 (incluídos na execução final).
- Suíte fiscal/config/security: **2.092 aprovados, 1 falha, 4 pulados preexistentes**; nenhum skip adicionado. Falha em `binding-gate.integration.test.ts`: ambiente gerenciado divergente do canônico, recusado pelo gate. Não considerar suíte integralmente aprovada; depende de correção externa do binding.
- ESLint dos cinco arquivos TypeScript alterados: aprovado, sem diagnósticos.
- Compilação automática: `build OK` em 2026-09-17T22:15:17Z.
- Typecheck separado não executado nesta rodada: execução manual de build/typecheck é vedada pelo ambiente; log automático disponível comprova build, não evidencia typecheck separado. Validação de tipos permanece não comprovada.
- Testes de replay são locais com objetos simulados; não constituem smoke de Storage/Edge Function implantada.

### Limites e estado real
As Edge Functions continuam **NÃO publicadas**, aguardando auditoria externa e deploy autorizado no alvo canônico. Não houve deploy, acesso remoto ao banco, transmissão de NF-e/NFS-e ou alteração dos bloqueios de produção. `production_emission_allowed=false` permanece conforme evidência anterior, sem revalidação remota nesta rodada. NFS-e e IBS/CBS não foram alterados. Não se declara homologação ponta a ponta nem aptidão para produção.
