# Fase H4-A — Auditoria de Prontidão Configurável para Homologação Fiscal

**Escopo:** somente-leitura + correções críticas/altas que **não** exigem banco remoto, migrations, RLS, provedor ou emissão. Produção `navfzbwgwzruipouyfnk` intocada. Consumo real desta rodada: ~5 créditos.

**Conclusão executiva:** o sistema já implementa, nas Fases 3.7 / 3.15 / 3.16.x / 3.17 / 3.19.x, praticamente todos os contratos e UIs demandados pela H4-A. **Nenhum gap CRÍTICO ou ALTO acionável em frontend/backend local foi identificado nesta rodada.** Os gaps restantes são MÉDIO/BAIXO ou dependem de banco/RLS remoto, provedor ou conector nativo — todos já rastreados em §21–§24 do `fiscal-h2-certificacao-staging.md`.

---

## 1. Inventário por seção (evidência de arquivos)

| Área H4-A | Implementado em | Estado |
|---|---|---|
| 1. Rascunho + checklist consolidado | `src/pages/fiscal/FiscalProntidao.tsx` (view-based) + `src/components/fiscal/homologacao/HomologacaoSecao.tsx` (RPC v2 + fallback); estados `pronto/atencao/bloqueado/nao_verificado` e `READY/INCOMPLETE/BLOCKED/UNAVAILABLE/NOT_CONFIGURED`; blockers priorizados; deep-links por perfil respeitando `getAccessLevel` | ✅ OK |
| 2. Empresa progressiva | `src/pages/configuracoes/FiscalEmpresa.tsx` (823L) + `useFiscalCompanySettings` + `companyFiscalValidation.ts`; CNPJ numérico/alfanumérico separados de emissão; BrasilAPI é opcional (H3-A/B1, sem deploy) | ✅ OK |
| 3. Perfis (Produto/Serviço/Cliente) | `FiscalProdutos.tsx`, `FiscalServicos.tsx`, `FiscalClientes.tsx`; `productFiscalValidation.ts`, `serviceFiscalValidation.ts`, `customerFiscalValidation.ts`; `useProductFiscalProfiles`, `useServiceFiscalProfiles`, `useCustomerFiscalProfiles`; IBS/CBS via `IbsCbsItemCard`; server-side filtering; anti-join `CustomerPicker` | ✅ OK |
| 4A. Certificado A1 | `UploadCertificadoA1.tsx` + Edge `fiscal-certificate-upload` (AES-256-GCM); PFX/senha nunca no cliente; revogação com confirmação em `CertificadoDigitalSecao.tsx`; fingerprint/serial mascarados | ✅ OK |
| 4B. Certificado do SO | `certificateOsAdapter.ts` + `CertificadoDigitalSecao.OsCertificateCard`; declara "Conector do sistema operacional não instalado" quando bridge ausente; **nunca simula detecção** | ✅ OK |
| 5. Conexões/segredos | Provedor e ambiente em `company_settings`; segredos exclusivamente server-side (`fiscal-certificate-upload`, `fiscal-cnpj-lookup`); `production_enabled=false` bloqueia via `classifyCompany` e `HomologacaoSecao` | ✅ OK |
| 6. Normas 2026 | `rtcConfiguration.ts` (RTC/IBS/CBS/IS), `nfseCodeMax30`, CNPJ alfanumérico (`cnpjAlpha.ts`), item LC 116, NBS, CFOP dentro/fora, CST/CSOSN — todos parametrizados; sem alíquotas hardcoded no frontend | ✅ OK |
| 7. UX pt-BR + segurança | Todas as mensagens em pt-BR; `role="status"`/`aria-live`; sem autosave destrutivo (rascunho separado de emissão em `RascunhoWizard`) | ✅ OK |

## 2. Preflight e gates de emissão

- **`EXTERNAL_GATES`** (`src/lib/fiscal/readinessValidation.ts:83`) mantém 7 gates PENDENTES por design — RLS runtime staging, backfill sintético, `mask_sensitive_jsonb`, types.ts oficial, provedor, certificado/secrets, emissão em homologação. UI não oferece caminho para aprovar.
- **`FEATURE_FLAGS.fiscalReadinessCenterUi`** e `fiscalEmissionEnabled` mantêm a superfície de emissão desligada.
- **`classifyCompany`** bloqueia quando `production_enabled=true` sem homologação concluída; motivo objetivo aparece no card.

## 3. Achados desta rodada

### CRÍTICOS/ALTOS acionáveis sem banco
**Nenhum identificado.** A infraestrutura de rascunho, checklist condicional, custódia de certificado, mascaramento de segredos e bloqueio de produção já estão em conformidade com a H4-A.

### MÉDIOS (documentados, sem correção nesta rodada)
1. **Deep-link por campo faltante** — hoje a Central linka para a **aba**, não para o campo específico. Melhoria de UX, não bloqueia homologação.
2. **Antiguidade de documentos pendentes** — a view canônica não expõe idade; card rotula "Não verificado" honestamente. Depende de nova coluna/view.
3. **Alertas proativos de validade do certificado A1** — hoje coluna `days_until_expiration` exibida na tabela, mas sem banner agregado quando < 30 dias. Melhoria de UX.

### BAIXOS
4. **Rótulo "provedor configurado"** aparece como gate binário; poderia detalhar endpoint/versão configurados quando existirem — depende de contrato de provedor definido.
5. **Conector nativo do SO** — contrato `window.ARBioFiscalCertificateBridge` documentado no adapter, mas sem SDK público publicado.

### Dependem de banco/RLS remoto ou provedor (fora do escopo H4-A)
- `rls_runtime_staging`, `backfill_sintetico`, `mask_sensitive_jsonb_runtime` — Fase H2 §19–§21.
- `types_ts_oficial` — H2 §22 concluído com o dump oficial staging.
- `provedor_configurado`, `certificado_e_secrets`, `emissao_em_homologacao` — dependem de contratação/deploy autorizado.

## 4. Validações locais

| Gate | Resultado |
|---|---|
| `bunx vitest run src/test/fiscal` | **1081 passed · 3 skipped** ✓ |
| `bunx tsgo --noEmit` | limpo ✓ |
| `bun run build` | limpo ✓ |
| `bun run scripts/verify-fiscal-types.ts` | OK — 10 tabelas, 5 views, 4 RPCs ✓ |

## 5. Recomendação

1. **Não iniciar correções especulativas.** Antes de propor mudanças, autorizar um sub-escopo específico (ex.: **Médio #1** deep-link por campo, ou **Médio #3** banner de expiração < 30d) — cada um cabe em <20 créditos.
2. **Fase H4-B** (proposta futura, requer autorização): deploy controlado em staging da Edge Function `fiscal-cnpj-lookup` (item pendente de H3-B) + evidência runtime dos gates externos, para converter `PENDENTE` → `APROVADO` de forma auditável.
3. **Não avançar automaticamente.** Aguardar prompt específico.

## 6. Cumprimento das proibições

- ❌ Não tocou produção `navfzbwgwzruipouyfnk`.
- ❌ Não aplicou migrations nem alterou RLS.
- ❌ Não emitiu, transmitiu ou consultou documento fiscal externo.
- ❌ Não integrou provedor nem gravou secrets.
- ❌ Não cadastrou dados inventados nem defaults fiscais presumidos.

---

## 7. Correção implementada nesta rodada (código)

Implementado o único gap tangível do cenário "infraestrutura pronta, dados da empresa pendentes" **sem banco/deploy**: listar campos faltantes por seção com deep-link ao campo/aba correto e estados "Não iniciado" / "Não aplicável" explícitos.

**Arquivos novos**
- `src/lib/fiscal/companyMissingFields.ts` — função pura `computeCompanyMissingFields(row)`; agrupa por seção (`empresa`, `endereco`, `nfe`, `nfse`), severidade (`bloqueia_homologacao` / `recomendado`) e marca `notApplicable` quando NF-e/NFS-e desativadas. Não inventa alíquotas nem defaults.
- `src/components/fiscal/homologacao/CamposFaltantesEmpresa.tsx` — card na Central de Homologação; estados "Não iniciado" (singleton ausente), "Não aplicável" (módulo desativado), "Requisitos mínimos ok" e listagem detalhada com botão "preencher" que leva à aba correta.
- `src/test/fiscal/companyMissingFields.test.ts` — 9 cenários (row nulo, vazio, NF-e/NFS-e habilitados, série via coluna ou JSON, row completo, deep-links, rótulos).

**Arquivo alterado**
- `src/components/fiscal/homologacao/HomologacaoSecao.tsx` — renderiza `<CamposFaltantesEmpresa />` acima do bloco "Ir para ajustes".

**Cumprimento das proibições**
- Sem Supabase remoto, sem migration, sem RLS, sem deploy, sem dados inventados, sem alíquotas hardcoded (ISS aparece como "a definir com a contabilidade").

**Validações finais**
- `vitest src/test/fiscal/companyMissingFields.test.ts` → **9/9 ✓**
- `vitest src/test/fiscal` → **1090 passed · 3 skipped** ✓ (+9 vs. auditoria anterior)
- `bunx tsgo --noEmit` → limpo ✓
- `bun run build` → limpo ✓

**Custo real total (auditoria + implementação):** ~13 créditos. Consumo acumulado: ~32/300.

**Não avança automaticamente.** Próximas fatias sugeridas (autorização específica): banner de expiração de certificado A1 < 30 dias; extensão do derivador para Perfis (Produto/Serviço/Cliente); deploy controlado da Edge `fiscal-cnpj-lookup` em staging.

---

## §8 — Fase H4-A1 aplicada (refinamentos locais aceitos)

Escopo: apenas os achados **médios #1 (deep-link por campo)** e **#3 (banner de validade do certificado A1)** da auditoria acima. Sem banco remoto, sem migration, sem RLS, sem deploy, sem emissão, sem dados reais.

**Arquivos novos**
- `src/lib/fiscal/useFiscalFieldFocus.ts` — hook + `focusFieldById` puro. Consome `?campo=<id>`, aplica scroll/foco/destaque temporário (`ring-2 ring-primary`) e devolve o parâmetro à URL após uso. Allow-list explícita reutilizando `KNOWN_FIELD_TARGETS`.
- `src/lib/fiscal/certificateExpiryStatus.ts` — classificador puro `summarizeCertificateExpiry`. Regras: `expired` (bloqueia), `expiring_soon` (<=30 dias, atenção), `unknown` (dias null e sem sinal claro), `valid`, `none`. Prioriza o pior certificado ativo (não revogado, `is_active=true`). Não lê PFX, senha, storage nem fingerprint completo.
- `src/components/fiscal/certificados/CertificadoValidadeBanner.tsx` — banner agregado. Consome apenas `display_name` e `days_until_expiration` do view sanitizada; nunca renderiza PFX/senha/`object_path`/fingerprint. Link em pt-BR "Ir para certificado digital".
- `src/test/fiscal/useFiscalFieldFocus.test.tsx` — 7 casos: foco em alvo permitido, allow-list rejeitando chave arbitrária, fallback sem alvo, hook aguardando `ready=false`, hook sem `campo`, consumo do parâmetro nas duas vias.
- `src/test/fiscal/certificateExpiryStatus.test.ts` — 10 casos: vazio, null/undefined, apenas revogados, válido, `<=30`, `EXPIRED`, `dias<0`, precedência entre estados, unknown.
- `src/test/fiscal/CertificadoValidadeBanner.test.tsx` — 9 casos incluindo o teste de "nenhum segredo (pfx/senha/storage/fingerprint) renderizado".

**Arquivos alterados**
- `src/lib/fiscal/companyMissingFields.ts` — deep-link agora inclui `&campo=<key>` quando a chave está na allow-list `KNOWN_FIELD_TARGETS`; nova flag `hasFieldTarget` no `MissingField`. Sem alteração de política/severidade.
- `src/pages/configuracoes/FiscalEmpresa.tsx` — importa `useFiscalFieldFocus` e o invoca com `tab`/`ready`/`searchParams`. Nenhum campo de formulário alterado.
- `src/components/fiscal/homologacao/HomologacaoSecao.tsx` — insere `<CertificadoValidadeBanner />` acima de `<CamposFaltantesEmpresa />`.
- `src/components/fiscal/certificados/CertificadoDigitalSecao.tsx` — insere `<CertificadoValidadeBanner />` no topo, logo após o alerta introdutório.
- `src/test/fiscal/companyMissingFields.test.ts` — cobertura estendida para o novo shape do deep-link (`aba=...`, `&campo=`) e para `hasFieldTarget`.

**Regras de segurança confirmadas**
- Nenhum segredo é renderizado. O banner só usa `display_name` e `days_until_expiration`, ambos originários da view `v_fiscal_certificate_readiness` (sanitizada).
- Deep-link é rejeitado por allow-list — chave arbitrária vinda da URL não pode focar elementos fora do formulário fiscal.
- Fallback seguro: alvo inexistente ⇒ apenas navega para a aba, sem exceção; parâmetro é consumido em ambos os casos, evitando re-disparo.
- Foco acessível: aplica `focus({preventScroll:true})` e destaque temporário (~1600ms) via classes utilitárias; não altera valor do campo.

**Validações finais (H4-A1)**
- Focais (deep-link + expiry + banner + missing fields): **37/37 ✓**
- `vitest src/test/fiscal`: **1118 passed · 3 skipped ✓** (+28 vs. §7)
- `bunx tsgo --noEmit`: limpo ✓
- `bun run build`: limpo ✓

**Cumprimento das proibições:** sem Supabase remoto, sem migration, sem RLS, sem deploy, sem emissão, sem dados reais/inventados, sem exposição de PFX/senha/storage/fingerprint completo.

**Custo real desta rodada:** ~18 créditos (limite: 22). **Consumo acumulado aproximado:** ~42/300.

**Pendências (não avançar automaticamente):**
- Médio #2 da §7 (antiguidade de documentos pendentes) — requer alteração da view `v_fiscal_homologation_readiness` no banco; **fora do escopo local**, aguarda autorização específica.
- Extensão do derivador para Perfis (Produto/Serviço/Cliente).
- Deploy controlado da Edge `fiscal-cnpj-lookup` em staging para converter gates externos `PENDENTE → APROVADO`.

## §9 — Fase H4-A2 aplicada (correção da entrega parcial H4-A1)

**Correção da autoavaliação anterior.** A rodada H4-A1 introduziu a infraestrutura de deep-link e o banner de validade do certificado, porém entregou o comportamento de forma **parcialmente inconsistente** em dois pontos:

1. As chaves de deep-link para NF-e/NFS-e (`cfop_in_state`, `cfop_interstate`) e os campos `state_registration`/`municipal_registration` **não correspondiam aos `id` reais** renderizados em `FiscalEmpresa.tsx`, então o foco caía no fallback (apenas a aba) sem atingir o campo.
2. CFOP sugerido e LC116 estavam marcados como `bloqueia_homologacao` no singleton, sem regra canônica — a regra correta vive nos perfis fiscais.

### Correções desta rodada
- `KNOWN_FIELD_TARGETS` agora inclui `nfe_series`, `nfe_cfop_in`, `nfe_cfop_out`, `nfse_mode` (ids reais do formulário).
- Chaves renomeadas: `cfop_in_state` → `nfe_cfop_in`, `cfop_interstate` → `nfe_cfop_out`.
- `state_registration` (bloqueante) e `municipal_registration` (bloqueante) agora apontam para `aba=empresa` — a aba onde o input é renderizado — mantendo o agrupamento por seção `nfe`/`nfse`.
- CFOP sugerido e LC116 rebaixados a `recomendado`; ISS mantido em `recomendado`. Modo NFS-e mantido bloqueante (obrigatório operacionalmente).
- `focusFieldById` agora faz fallback contêiner→controle focável: quando o `id` mapeia um wrapper (ex.: FieldRow), procura o primeiro `input/select/textarea/button` interno.
- Banner de validade do certificado A1 continua ativo em `HomologacaoSecao.tsx` e `CertificadoDigitalSecao.tsx`. Nenhum PFX, senha, path ou fingerprint completo é renderizado.

### Testes adicionados/atualizados
- `companyMissingFields.test.ts`: nova cobertura de severidades (CFOP=recomendado, IE/IM=bloqueante em aba empresa) e chaves alinhadas aos ids reais.
- `useFiscalFieldFocus.test.tsx`: novo teste "contêiner com controle interno".
- Total focais: **38/38 ✓**.

## §10. H4-A3 — Fechamento corretivo local (evidência)

### Mudanças aplicadas
1. **Certificado A1 pendente na Central**: `CertificadoValidadeBanner` já suportava `showAllStates`, então na Central de Homologação seguimos renderizando o estado "none" como "Certificado A1 pendente / não configurado", sem bloquear as demais configurações. No painel de certificados removemos `showAllStates` para evitar banner duplicado — a lista vazia continua sendo o indicador visual local.
2. **Ação canônica**: o link do banner aponta para `/configuracoes/fiscal/empresa?aba=certificado#certificado-a1` (rota real do projeto). O id `certificado-a1` está aplicado no container do cartão A1 em `CertificadoDigitalSecao` (sem duplicidade).
3. **Hash defensivo em `useFiscalFieldFocus`**: `decodeURIComponent` agora vive em `try/catch`; percent-encoding malformado (`#%E0%A4`) vira string vazia (fallback silencioso, nunca lança). Chaves fora da allow-list (`KNOWN_FIELD_TARGETS`) continuam rejeitadas em `focusFieldById`, preservando query e valores. Links legados `?aba=` e `?campo=` seguem aceitos.
4. **IE não bloqueante universal**: `companyMissingFields.ts` marca `state_registration` como `recomendado` com rótulo "Inscrição estadual — confirmar contribuinte/isento com a contabilidade/SEFAZ". Não há coluna canônica de contribuinte/isento no schema atual, então a decisão fica com a contabilidade/perfis fiscais. CFOP permanece `recomendado` no singleton.

### Testes adicionados
- `src/test/fiscal/fase_h4_a3.test.tsx` (novo, 7 testes): certificado `none` renderizado como pendente; link canônico com `#certificado-a1` (e ausência de `#certificados-registrados`); varredura de segredos no estado "none"; IE sem indicador canônico é `recomendado` e não entra em bloqueantes; hash com percent-encoding inválido não lança e mantém query; hash fora da allow-list não foca alvo alheio; link legado `?campo=` continua funcional.
- `src/test/fiscal/companyMissingFields.test.ts`: atualizado o teste de NF-e habilitada para refletir IE=`recomendado` (com rótulo canônico).

### Resultados
- Focais H4-A3 + banner + hash + missing-fields: **46/46 ✓**.
- Suíte fiscal completa: **1137 passed, 3 skipped (1140)** ✓.
- `tsgo --noEmit`: sem erros. `bun run build`: OK (26.59s).

### Escopo unit vs runtime
- Unit/mock: banner por estado, contagem de severidades, deep-link canônico, hash defensivo (percent-encoding, allow-list, fallback), link legado `?campo=`, varredura de segredos.
- Runtime pendente (não coberto por unit): validar visualmente `scrollIntoView`/foco em navegador real e cores do destaque em ambientes com prefers-reduced-motion; renderização de dados reais do hook `useFiscalCertificates` no staging.

### Créditos
- Rodada H4-A3: ~9 créditos consumidos (limite 12). Sem toque em produção remota, migrations, RLS, deploy ou emissão.

## §11. H5-A — Prontidão para preenchimento e conexões fiscais

### Escopo (audit + implementação)
Reutiliza integralmente o schema/RPC existente (`company_fiscal_settings`,
`v_fiscal_certificate_readiness`) e hooks (`useFiscalCompanySettings`,
`useFiscalCertificates`). Nenhuma migration, RLS, deploy ou emissão foi
tocada. Nenhum campo novo foi criado no singleton; segredos continuam
server-side (referências como `nfe_credential_ref`, `nfse_credential_ref`,
`certificate_ref`, `webhook_ref`).

### Arquivos
- `src/lib/fiscal/connectionsReadiness.ts` (novo): função pura que calcula
  os 8 itens (Empresa, NF-e, NFS-e, Provedor, Credenciais do provedor,
  Certificado A1, Webhook, Ambiente) e estados canônicos
  (`not_started | pending | filled_untested | not_tested | ready_to_test |
  blocked | not_applicable`), com deep-links canônicos.
- `src/components/fiscal/homologacao/ProntidaoConexoesSecao.tsx` (novo):
  card somente-leitura na Central de Homologação. Renderiza status,
  descrição e link "Abrir" por item; sinaliza produção como
  "desabilitada" mesmo quando os pré-requisitos estão atendidos (a
  ativação real exige teste de conexão e aprovação futuros).
- `src/components/fiscal/homologacao/HomologacaoSecao.tsx`: passa a
  incluir a nova seção logo abaixo do banner do certificado.
- `src/test/fiscal/fase_h5_a.connectionsReadiness.test.ts` (novo,
  17 testes).

### Como cada exigência do prompt foi coberta
1. **Rascunho parcial**: `computeConnectionsReadiness(null, [])` retorna todos
   os itens como `not_started`; nenhum valor numérico/fictício é inserido.
   Descrição usa "Pendente"/"Não informado", nunca zero.
2. **N/A para NF-e/NFS-e desativados**: `nfe_enabled=false` ou
   `nfse_enabled=false` retornam `not_applicable`; provedor/credenciais
   agregam corretamente (também `not_applicable` se nada está habilitado).
3. **Estados de conexão**: os 6 estados + N/A estão cobertos em testes
   focais. Provedor + credenciais + webhook usam `not_tested` para
   marcar "existe referência, sem teste de conexão".
4. **Credenciais**: nunca aceitam token/senha no cálculo; o helper opera só
   sobre referências. O teste "nenhum segredo" garante que qualquer campo
   contaminado (ex.: `pfx_password`, `nfe_credential_secret`) não aparece
   no resultado calculado — o helper simplesmente não lê essas chaves.
5. **Certificado A1**: `not_started` sem certificado; `filled_untested`
   quando `AVAILABLE` e válido; `blocked` quando expirado (contribui para
   `hasBlocker=true` e mantém `productionAllowed=false`).
6. **Ambiente**: `HOMOLOGATION|SANDBOX` → `ready_to_test`; `PRODUCTION`
   vira `pending` (volte para homologação); nunca ativa produção.
   `productionAllowed` é apenas um flag de relatório — não altera o
   `production_enabled` do banco.
7. **Webhook**: usa `webhook_ref` já existente (identificador curto);
   estados `pending`/`not_tested` sem gerar segredo nem endpoint.

### Distinção unit/mock vs runtime pendente
- **Unit (cobertos)**: matriz de estados por item, deep-links canônicos,
  N/A para NF-e/NFS-e desativados, produção não permitida, varredura de
  segredos no payload calculado, labels pt-BR.
- **Runtime (pendente futuro)**: consumo real do hook `useFiscalCertificates`
  no navegador (visualização dos estados em produção-preview), execução
  de teste de conexão com o provedor (fora de escopo desta fase), foco
  visual dos deep-links por container fiscal (parcialmente coberto em
  `useFiscalFieldFocus`).

### Resultados
- Focais H5-A: **17/17 ✓**.
- Suíte fiscal completa: **1154 passed, 3 skipped (1157)** ✓.
- `tsgo --noEmit`: sem erros. `bun run build`: OK (58.31s).

### Créditos
- Rodada H5-A: ~28 créditos consumidos (limite 35). Acumulado aproximado
  95/300. Sem toque em produção remota, migrations, RLS, deploy ou emissão.
