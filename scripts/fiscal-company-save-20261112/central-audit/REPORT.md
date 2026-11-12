# Central Fiscal — correções da auditoria (prévia, sem publicação)

Base: commit `1a58a87df8037be0be6dad43a566130e45744c48` + alterações desta entrega (frontend apenas; nenhum SQL/Edge/remoto).

## Arquivos alterados
- `src/components/fiscal/CompanyAccreditationsFields.tsx` — UF única pré-selecionada; várias UFs exigem "Editar" explícito; nova UF em branco; false ("Não apta") ≠ ausente ("Não informada", remove só a chave); seleção mantida e aviso até salvamento geral; duplicadas bloqueiam.
- `src/lib/fiscal/companyAccreditations.ts` — `lookupAccreditation`, `accreditedUfs`, merge com `null` preservando metadados.
- `src/lib/fiscal/companyFiscalValidation.ts` — `valuesForValidation`/`buildUpdatePayload(values, baseline)`: chaves JSON idênticas às lidas não são revalidadas nem normalizadas (zero, false, null, códigos legados); chaves sensíveis seguem bloqueadas; travas (fiscal_provider NONE, nfe/nfse_enabled false, ambiente 2, sem configuration_status) intactas.
- `src/hooks/useFiscalCompanySettings.ts` — repassa baseline.
- `src/pages/configuracoes/FiscalEmpresa.tsx` — SelectNative com "Não informado" explícito (nunca primeiro item como gravado), legado "Valor atual não listado (x) — mantido"; "Não informado" remove a chave; rótulos acessíveis nos switches; botão único "Salvar configuração" só em Empresa/NF-e/NFS-e/Integração.
- `src/lib/fiscal/providerLabels.ts` — nomes legíveis dos provedores (somente exibição).
- `src/test/fiscal/companyFiscalSave.original.test.tsx` — 5 testes novos.

## Testes
- Vitest focado: 53/53. Bateria fiscal: 2118 ok, 1 falha `h7i` (timeout de 5s ao varrer a árvore; isolado: ver `evidence/vitest-h7i-isolado.txt`), não relacionada.
- Playwright Chromium headless real: `central_fiscal_e2e.py`, viewports 1280x1800 (desktop) e 390x844 (celular, is_mobile/touch): 88/88 checks (`evidence/results.json`, `playwright-run.log`, capturas `*.png`, `*-store-final.json`).

## Nível de simulação
- Homologação hospedada NÃO foi acessada (regra do projeto: só ref canônico, sem escrita remota). Montado ambiente isolado: código atual servido pelo Vite local, página/hook/SDK Supabase reais; Auth substituído por ator sintético administrador; PostgREST/RPC substituídos por API local em Python com persistência em arquivo entre recargas, CAS por `configuration_version` e revisão RTC, recusa de campos proibidos e de abertura de emissão. Outras origens abortadas.
- Emitente FICTÍCIO (`org-ficticia-homolog`); nenhum dado AR Bio/produção.
- Não comprova JWT/RLS/PostgREST reais, constraints do banco real nem bundle de produção (`vite build`).
