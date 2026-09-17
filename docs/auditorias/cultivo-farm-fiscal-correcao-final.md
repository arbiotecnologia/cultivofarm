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
