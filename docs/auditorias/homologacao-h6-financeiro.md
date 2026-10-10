# H6/H6b — Homologação do Financeiro AR Bio

## Adendo vigente — fechamento externo dos geradores67d3a432 / testedbec675 — 2026-10-10 02:23 UTC

**Escopo desta rodada: exclusivamente roadmap e este relatório.** Evidências abaixo recebidas do **Codex autorizado externamente ao Lovable**, sem reexecução própria de testes, SQL, UI ou implantação; sem código/AGENTS/deploy/banco/grants/migration/frontend/nova fase ou alteração de dados financeiros/gates.

### Revisão, verificações e implantação externas

- **Rerun Windows175/175 PASS após parser binário**, para fechamento dos geradores `67d3a432` e teste `dbec675`; supersede a pendência de rerun independente dos checkpoints anteriores, preservando o histórico173PASS/2FAIL e o resultado Linux separado. Não somar checkpoints.
- **Typecheck app/node, lint, scanner3858/zero e build31.64s PASS**, com avisos legados, conforme relato externo. Não comandos executados nesta rodada pelo Lovable nem prova Deno typecheck.
- Codex implantou **`generate-financial-report` versão75 ACTIVE**, **referência implantada `67d3a432`**, `verify_jwt=false` com **getUser preservado**; recuperou **index/CORS com igualdade exata**, conforme provas externas. Supersede pendências históricas de revisão/implantação dos geradores; nenhum deploy realizado pelo Lovable neste fechamento.

### PASS de conteúdo real/local não é PASS de exportação em produção

- **PDF real/local:** baseline **1página/55 de100registros** versus novo **10páginas/100 de100**, com texto longo, última coluna/fim do texto e rodapés todos PASS. pdf-lib1.17.1 real bundled; extração pypdf e10páginas renderizadas/inspecionadas sem cortes, conforme QA externo. Pendência de QA dessa fixture supersedida, não homologação de volume máximo ou runtime remoto.
- **XLSX bytes serialize/read roundtrip e CSV parser real PASS**, conforme provas locais/externas registradas. Conteúdo dos arquivos validado no recorte; **SDK/Auth/Storage simulados localmente**. Não upload/download/assinatura/histórico real nem certificação integral da exportação.
- **UI real externa FinanceiroAR, CSV mensal:** preflight **204→HTTP500**, corpo exato **`{"error":"financial_report_unavailable"}`**, **sem URL/path**. **Toast não observado; NÃO afirmar UX PASS**, geração PASS ou download PASS.
- **SQL posterior externo:0reportobjects/0historyAR**; `monthly` e `register` mantêm **authenticated EXECUTE=false**. Nenhum dado financeiro, grant, migration ou frontend alterado, conforme relato; nenhuma consulta remota própria nesta rodada.

### Pendências e NO-GO preservados

- **Geração/download em produção e exportação NO-GO**, apesar do PASS focal de conteúdo arquivo real/local e da versão75 implantada externamente. **RPCs de dados SECURITY DEFINER/ACL fechada**, RLS internas, entitlement, StorageHTTP, volume/limites antes consultaRPC, idempotência e reconciliação de órfãos continuam pendentes; sem abrir grants ou excluir blobs automaticamente.
- **P2 documentados, sem correção:** cabeçalho PDF legado ARBio e registro dividido entre páginas. PASS de ausência de cortes não significa eliminação dessas pendências de apresentação.
- Financeiroglobal/B2B/OS/fiscal/Faturamento, demais matrizes e gates permanecem **NO-GO**. Histórico +40/-40 preservado. Nenhuma nova fase iniciada; somente fechamento documental. Rollback mantém canal fechado e contenção substitutiva, sem restaurar injeção/truncamento/falso sucesso.

---

## Adendo vigente — parser CSV Windows e QA PDF externo — 2026-10-10 02:20 UTC

- **Revisão independente67d3a432 recebida:** Codex relatou **175total/173PASS/2FAIL** no Windows; `sys.stdin.read()` normalizava CR/CRLF antes de csv.reader. Não falha do gerador nem motivo para adaptar expectativas. Resultado independente preservado, distinto do PASS Linux anterior.
- **Única alteração de teste:** parser usa `sys.stdin.buffer.read().decode('utf-8')` dentro de `StringIO(newline='')`, preservando bytes/quebras originais; `process.env.PYTHON ?? "python3"` e todas as expectativas permanecem iguais. Nenhuma alteração de PDF/CSV/XLSX/handler/biblioteca/lock/AGENTS.
- **Rerun próprio local:175/175 PASS (126handler+37shell+8scope+4storage)**, `/tmp/financial-csv-parser-rerun.log`, início02:21:33UTC. Lint do teste e diff-check PASS. **Rerun independente Windows PENDENTE**, não certificado pelo resultado local. Typechecks separados/scanner/Deno NOT RUN nesta rodada.
- **QA PDF real externo Codex:** pdf-lib1.17.1 bundled gerou fixture com100registros, texto longo e última coluna; **10páginas,100marcadores, último campo/fim do texto/rodapés todos PASS**. Extração com pypdf e **10páginas renderizadas e inspecionadas sem cortes**, conforme evidência recebida, não execução própria do Lovable. SDK/Auth/Storage foram simulados localmente. Supersede pendência de bytes/extração/QA **dessa fixture local** nos checkpoints anteriores; não PASS UI/produção/upload/download/runtimeEdge/volume máximo.
- **Sem deploy, banco/grants, frontend ou Storage real. Exportação/Financeiroglobal/B2B/OS/fiscal/Faturamento NO-GO**; limites anteriores à consulta/paginaçãoRPC, runtime/volume e serviços reais permanecem pendentes. Entrega teste/documentação para revisão; nenhum gate aberto.

---

## Adendo vigente — revisão a6787c35 / XLSX focal — 2026-10-10

- **Escopo:** mesmo index.ts/teste existente e documentação; sem alteração de AGENTS, biblioteca/lock, frontend, DB/grants/gates, deploy/publicação, Storage real ou histórico financeiro. CSV/PDF e ordem upload→assinatura→registro→URL preservados. CSV teste passa a usar `process.env.PYTHON ?? "python3"`.
- **Baseline externa recebida:** `json_to_sheet` aceita `{f:"1+1",t:"n"}` como definição de célula/fórmula e objeto período como célula inválida. **Reproduzido independentemente localmente com SheetJS0.20.2 já instalado:** A2f=1+1, B2objeto inválido. Runtime Edge continua usando versão0.18.5 existente, não substituída nem certificada pelo teste local0.20.2.
- **Correção XLSX:** matriz AOA com união de colunas; somente strings, números finitos, booleans e null. Objetos/arrays serializados JSONtexto, nunca encaminhados como definição de célula; strings inclusive `=,+,-,@,TAB/CR/LF` e cabeçalhos permanecem tipo string sem `f`, não fórmulas. Números negativos legítimos preservados. Busca own-property impede herança de `constructor`/`__proto__`, sem atribuição em objeto por chave adversa. null/undefined e campos ausentes vazios; vazio sem registro fictício.
- **Nome da aba:** remove `[]:*?/\` e controles, elimina apóstrofos de borda, limita31caracteres, fallback não vazio `Relatorio`.
- **Limites:** rows validadas antes de Object.keys/união de colunas em todos formatos. XLSX também recusa mais de1000registros, mais de1MiB UTF8 do conteúdoJSON(rows/title/filters), mais de5MiBbytes finais; erro seguro antes upload/assinatura/histórico, sem truncar. Números não finitos e linhas null/primitivas/array recusados. Limites são **pós-RPC**, não paginação nem contenção de volume antes consulta; essa dívida permanece aberta.
- **Baseline própria126casos14FAIL/112PASS**, `/tmp/financial-xlsx-baseline.log`; **final126/126handler e175/175regressão (126+37shell+8scope+4storage) PASS**, `/tmp/financial-xlsx-regression.log`. Não somar checkpoints históricos. **XLSX serialize/read REAL**, usando biblioteca instalada, inspeciona tipos e ausência de fórmula, nestedobjects/arrays, strings/cabeçalhos adversos, -42.5/boolean/null, última coluna no1000ºregistro, nomeaba, vazio/inválidos/limites. SDK/Auth/Storage continuam mocks, limite5MiBbytes usa injeção controlada; não prova upload/download/Excel visual/runtimeEdge/volume máximo real.
- **Lint dois arquivos, diff-check PASS; build automático OK02:17:19UTC.** Typechecks app/node separados, scanner e Deno check NOT RUN. AGENTS SHA25687175b23cd098b666096675144414ae09791cca353a67fd1fe4d43f41a42b244 intacto.
- **PDF externo:** Codex informou pdf-lib1.17.1 real bundled e baselinearquivo1página55/100; fará QA real do patch local. Não indisponibilidade global da biblioteca, nem PASS final baseado apenas em mocks; **bytesPDFreal/extração/QA final pendentes de evidência externa**, sem execução própria desta rodada. CSV/PDF não reescritos neste adendo.
- **Entrega local sem deploy. Exportação/Financeiroglobal/B2B/OS/fiscal/Faturamento NO-GO**, grants permanecem fechados. Histórico XLSX não auditado das rodadas anteriores mantido como passado; prova local focal acima não certifica produção. Rollback deve manter canal fechado e contenção substitutiva, sem restaurar injeção/falso sucesso nem abrir grants. Nenhuma nova grande fase.

---

## Adendo vigente — fechamento externo da contenção e geradores locais — 2026-10-10

### Contenção implantada externamente — proveniência Codex

- **`f78d2a4` revisado** pelo Codex autorizado externamente ao Lovable: **121/121 PASS (72handler+37shell+8scope+4storage)**, typecheck app/node, lint2, scanner3858/zero, build30.82sPASS, conforme evidência recebida. Não nova execução própria nem soma de checkpoints repetidos.
- Codex implantou **Edge72 ACTIVE**, `verify_jwt=false` com **getUser preservado**, e recuperou **dois arquivos com igualdade exata**, conforme relato. **Baselinev69 capturada; origem das versões70/71 NÃO inferida. Deno typecheck NOT RUN.** Supersede pendência de deploy da contenção anterior, preservando os checkpoints históricos; não implantação dos geradores alterados nesta rodada.
- **UI FinanceiroAR CSV→HTTP500 observado viaCDP**, contagens AR **reportobjects0/history0 antes/depois**, grants monthly/registerfalse. **NÃO PASStoast, geração ou download**; nenhuma operação remota, upload ou mutação executada pelo Lovable.

### Baseline e correção focal dos geradores existentes

- Baseline independente externa: PDF100linhas→55drawTextrows/rodapé100/última ausente; CSV com backslash nas aspas e `\\n` em vez de quebras reais, `=1+1` ativo. Recebida do Codex, não análise de bytes própria.
- **Baseline própria antes do fix:94 casos,20FAIL/74PASS**, `/tmp/financial-generators-baseline.log`, entrypoint real com SDK/renderers injetados. **Final99/99handler PASS; regressão148/148 (99handler+37shell+8scope+4storage)**, `/tmp/financial-generators-regression.log`. Não somar baseline nem repetição intermediária94/94.
- **CSV:** campos entre aspas, aspas internas dobradas, separador de registrosCRLF e newlines reais dentro dos campos; cabeçalhos do conjunto união de colunas. Arrays/objetos serializados em JSON preservando valores. Neutralização por apóstrofo **antes do conteúdo original** para strings/cabeçalhos iniciando `=,+,-,@` ou TAB/CR/LF, inclusive espaços iniciais; **números legítimos negativos permanecem numéricos**, sem prefixo. Testes fazem **parse roundtrip real via Python csv**, aspas/vírgulas/quebras/cabeçalhos, aninhados e injeção; não certificam Excel/LibreOffice real.
- **PDF:** apresentação por registro/campos dentro do gerador existente, união de colunas, valores aninhadosJSON; sem slice/substrings/break silenciosos de dados. Quebra cada parágrafo por largura medida na **fonte efetivamente embutida**, inclusive palavra longa; paginação A4 com margens e rodapé verdadeiro `total registros / PáginaN de total`. Todos100registros e último campo verificados, além de exatamente1000registros dentro dos limites locais.
- **Fonte:** Helvetica existente preservada; medição/draw com caractere incompatível ou erro de fonte aborta antes upload, com erro público seguro. **Nenhuma substituição silenciosa** por caractere alternativo. Testes cobrem valor, título, cabeçalho e nestedobject incompatíveis.
- **Limites prudentes locais PDF/CSV:** até **1000registros**, **100páginas PDF**, **1MiB UTF8 do conteúdo JSON (rows/title/filters)** e **5MiB de bytes finais**. Ultrapassar qualquer limite retorna erro seguro500 **antes upload**, em vez de omitir registros/campos; testes de excesso/limite de linhas, páginas, conteúdo e bytesPDF. Não constituem homologação de volume real. XLSX não alterado; suas limitações/injeção/volume seguem fora deste recorte e não certificados.

### Validações, limites e entrega

- **Lint dois arquivos, diff-check PASS; build automático OK2026-10-10T02:13:34Z.** Typechecks app/node separados, scanner e Deno check **NOT RUN nesta rodada**; checks Codex anteriores têm proveniência externa separada. AGENTS SHA256 `87175b23cd098b666096675144414ae09791cca353a67fd1fe4d43f41a42b244` intacto.
- **pdf-lib local indisponível** em dependências/node_modules/cache inspecionados. Sem rede ou instalação autorizada: **fixture bytesPDFreal, extração e QA visual NOT RUN**. Renderers simulados e drawText não provam bytesPDF, fonte real, ausência de sobreposição ou leitura integral em visualizador. Não gerado PDF por biblioteca substituta. Orientações da **skill PDF** usadas para exigir QA visual quando bytes reais estiverem disponíveis; sem alegar essa validação como concluída.
- Alterados somente **`supabase/functions/generate-financial-report/index.ts`**, **`src/test/financeiro/financialReport.edge.test.ts`**, roadmap e este relatório. Proteções upload→assinatura→registro→URL, ANON/caller/getUser/h15org/CORS/saneamento/tenant/grants/gates preservadas. Sem frontend/banco/Storagereal/AGENTS/service_role/deploy/publicação ou alteração do histórico+40/-40.
- **Entrega local para revisão, sem deploy. Exportação permanece NO-GO** por RPCs bloqueadas, volume/runtime/bytesPDFreal/QA visual pendentes e XLSX não auditado. Financeiroglobal/B2B/OS/fiscal/Faturamento e matriz integral seguem NO-GO. Reconciliação de blobs privados segue pendente, sem exclusão automática; trigger do ledger autoritativo continua distinto de blob sem registro.
- **Rollback:** manter exportação fechada, sem abrir grants nem restaurar falso sucesso/truncamento/injeção; correção substitutiva revisada antes de eventual reversão. Nenhuma nova grande fase iniciada.

---

## Adendo vigente — revisão focal611af508 antes de deploy — 2026-10-10

**Escopo:** somente `supabase/functions/generate-financial-report/index.ts`, teste existente `src/test/financeiro/financialReport.edge.test.ts`, roadmap e este relatório. Revisão independente aprovou focalmente ordem e saneamento, conforme relato Codex autorizado externamente ao Lovable. Sem frontend/banco/grants/RLS/gates/geradores/AGENTS, service_role, deploy/publicação, Storage real ou alteração do histórico +40/-40.

### Duas lacunas contidas e provas próprias

- Upload confirma **ausência de error E `data.path === path`**. Retorno data ausente, path ausente/divergente ou error (mesmo com path correto) retorna erro seguro500, sem URL/path/log cru, assinatura ou registro. Mocks de sucesso agora devolvem o path efetivamente solicitado.
- `hasTenantArgument` inspeciona **objetos e arrays aninhados** de filters, inclusive `_filters`/`_scope`, recusando chaves próprias `organization_id`/`tenant_id` em qualquer ramo. Travessia **iterativa**, sem recursão, limitada a **64 níveis e orçamento de10000 valores**; excesso é400 fail-closed antes de Auth/RPC/Storage, sem ignorar subárvore nem apagar campos. Validação top-level permanece explícita; demais contratos não foram alterados.
- Contratos válidos `_filters`/`_scope`, arrays, valores nulos, texto contendo nome de chave e aninhamento válido profundo são enviados **sem normalização** ao RPC e ao histórico. Testes com objetos/arrays alternados cobrem forja profunda, excesso de profundidade e largura.
- **Baseline própria antes da alteração funcional:72 testes,15FAIL/57PASS**, log `/tmp/financial-edge-review-baseline.log`; reproduziu as lacunas com o entrypoint real sob SDK/Auth/renderers injetados, sem rede ou efeitos reais. **Final72/72 handler PASS; regressão117/117 PASS (72handler+37ReportShell/mensal+8scope)**, log `/tmp/financial-edge-review-final.log`. Não somar checkpoints repetidos nem baseline Codex.
- **Lint dois arquivos e diff-check PASS; build automático OK2026-10-10T02:05:01Z**. Typechecks app/node separados, scanner e Deno/Edge check **NOT RUN**; build app não certifica runtime/deploy Edge. PASS mocks não é PASS UI/JWT/RLS/upload/download/assinatura/ledger remoto.

### Evidência externa Codex e precisão sobre tenant

- Harness **baselinev69**, independente: **cinco cenários auditerror/noid/signerror/nourl/formatoEXE retornaram200:5FAIL**, sem efeitos reais. Evidência recebida, não execução do Lovable e distinta das baselines próprias.
- Catálogo externo: **10RPCs de dados + `register_financial_report_export` todas SECURITY DEFINER, `authenticated EXECUTE=false` e `anon EXECUTE=false`**. Gates deliberados preservados; nenhum grant aberto ou SQL executado nesta rodada.
- Trigger existente **`guard_tenant_organization_id` preenche organização no INSERT e impede forja**, conforme evidência Codex. A ausência de org explícita nos argumentos do registro **não deve ser classificada como ledger órfão sem tenant**. Isso é distinto do **possível blob privado de Storage sem registro confirmado** após upload e falha subsequente; reconciliação futura explícita/auditada segue pendente, sem exclusão automática.
- Proveniência de consulta externa: fonte **.md do changelog falhou**; **HTML e documentação Storage consultados** pelo executor conforme relato, não consulta própria nem certificação remota pelo agente.

**Entrega local para revisão, NÃO deploy/publicar.** Ordem upload confirmado→assinatura em memória→registro SUCCESS com ID→URL preservada. Exportação e geradores integrais (PDF truncamento, CSV escaping/formula injection) **NO-GO**; mensal real/Financeiroglobal/B2B/OS/fiscal/Faturamento, Storage/planos e matriz integral continuam pendentes. Rollback seguro mantém canal fechado e contenção substitutiva, sem reabrir falso sucesso/grants ou remover histórico/blobs automaticamente. Nenhuma outra fase iniciada.

---

## Adendo vigente — contenção local da Edge generate-financial-report — 2026-10-10 02:02 UTC

**Base informada:** `93ee82a7`. **P1 — falso sucesso na exportação:** evidência remota Codex autorizado indica v69 com ANON+caller/getUser/h15org, mas sem verificar erros/resultados de registro/assinatura. `monthly` e `register_financial_report_export` permanecem com `authenticated EXECUTE=false`; **não abrir grants**. Esta rodada leu AGENTS/código e alterou somente handler existente, teste local e documentação; sem frontend, banco/RLS/grants/gates/service_role, deploy/publicação, Storage real ou mutação de fixture. AGENTS SHA256 `87175b23cd098b666096675144414ae09791cca353a67fd1fe4d43f41a42b244` preservado.

### Baseline própria antes do fix e arquivos

- `src/test/financeiro/financialReport.edge.test.ts` executa **entrypoint real** `supabase/functions/generate-financial-report/index.ts` com SDK/env/Auth/renderers injetados localmente, seguindo padrão existente de testes de handler; sem fluxo paralelo, rede, URLs reais ou bytes Storage.
- **Baseline própria:51 testes,38FAIL/13PASS**, ANTES do fix (`/tmp/financial-edge-baseline.log`). Reproduziu sucesso indevido com erro de Auth mantendo usuário, erro/ausência de URL ou ID de registro, método/payload/formato/tenant/prototype inválidos aceitos, ordem registro antes assinatura. Não somar com baselines anteriores de ReportShell ou independentes Codex.
- Arquivos funcionais: **`supabase/functions/generate-financial-report/index.ts`** e **`src/test/financeiro/financialReport.edge.test.ts`**; mais roadmap e este relatório. Não reescritos PDF/CSV/XLSX, não criada RPC/tabela/rota/core paralelo.

### Contenção e contrato

- Validação antes RPC/Storage: somente **POST**, JSON objeto não array; `report_type` com **own-property** na allowlist existente (constructor/toString/__proto__ negados); formatos exatamente **PDF/XLSX/CSV**; filters objeto não array; title opcional texto até **255 caracteres**. `organization_id`/`tenant_id` no topo ou como args filters **rejeitados**, não normalizados; demais filtros preservados.
- Origem confiável/preflight/CORS existentes preservados. Cliente somente **ANON com bearer caller**, `getUser` exige ausência de erro e usuário/ID; organização deriva de **h15_actor_organization** com erro/ausência negados. URL de ambiente deve ser exatamente canônica e chave anon presente antes de criar cliente; não cliente frontend paralelo nem service_role.
- Ordem obrigatória: **upload → assinatura em memória → registro SUCCESS confirmado com ID → devolver URL**. Upload com erro interrompe; assinatura com erro OU URL ausente/vazia interrompe antes do registro; registro com erro OU ID ausente/vazio interrompe antes de resposta de sucesso. Exceções também ficam contidas.
- Falhas retornam somente erro público fixo (`financial_report_unavailable` para operações), **sem URL/path/detalhes crus nem logs de erros**; payload/método/auth/tenant têm códigos explícitos seguros. Sucesso mantém contrato existente somente depois de todas as etapas.
- **Sem exclusão automática.** Falha depois do upload pode deixar **órfão privado**; assinatura gerada permanece apenas em memória e não é devolvida após falha do registro. Registro e Storage não são transação atômica: futura reconciliação requer autorização, inventário e auditoria, sem ampliar permissões ou remover fences. Upload/upsert existente preservado; concorrência remota/idempotência não certificadas.

### Validações próprias e limites

- Primeira rodada pós-fix **51/51 PASS**; final ampliada **54/54 handler PASS**, incluindo env canônico ausente/divergente/chave ausente. Regressão **99/99 PASS** (**54handler +37ReportShell/mensal +8scope**); não somar repetições. Nova rodada handler após correção da tipagem dos mocks **54/54 PASS**.
- Testes cobrem erros/ausências Auth/org/RPC/upload/assinatura/audit, exceções, URL/ID ausentes, efeitos interrompidos, formatos inválidos/prototype/tenant forjado, JSON/métodos/origem, caller sem service_role, ordem de efeitos, audit pendente sem resposta e sucesso PDF/XLSX/CSV apenas após todas as etapas. **PASS mocks não prova JWT/RLS, runtime Deno, UI ou upload/download real.**
- **Lint dos dois arquivos PASS e diff-check PASS**. Harness detectou dois erros de tipagem nos mocks, corrigidos; **build automático OK2026-10-10T02:01:52Z** após correção. Typecheck app/node separados e Deno/Edge check **NOT RUN**; build app não equivale a check/deploy da Edge.
- Produção **v69 não foi alterada/deployada pelo Lovable nesta rodada**; delta local entregue para revisão. Nenhum teste remoto, SQL, upload, assinatura, registro ou exportação real executado pelo agente.

### NO-GO e rollback seguro

- **Exportação NO-GO**, pois grants deliberados continuam fechados e runtime/Storage/UI não certificados. **PDF truncamento, CSV escaping/formula injection e geradores integrais permanecem NO-GO**, sem reescrita neste recorte.
- Mensal real/geração, matriz integral, demais relatórios/recorrência/Storage/planos, Financeiroglobal/B2B/OS/fiscal/Faturamento NO-GO; Mobile/payable UI integral UNVERIFIED preservados. Histórico +40/-40 intacto.
- **NÃO deploy/publicar automaticamente**; aguardar revisão. Rollback nunca deve reabrir falso sucesso ou grants: manter canal fechado e exigir contenção substitutiva revisada, sem excluir órfãos/histórico por conta própria. Nenhuma nova grande fase iniciada.

---

## Adendo vigente — revisão independente e publicação externa — 2026-10-10 01:53 UTC

**Referência:** `5a5ad9e6edf48b8f5b8a6de57a9caa9f1f310c29`. Evidências de revisão, checks, publicação e browser recebidas do **Codex autorizado externamente ao Lovable**, não executadas pelo humano manualmente nem por este agente. Revisão independente concluída e publicação **JÁ realizada externamente**; UI confirmou **“Seu site foi atualizado”**. Supersede somente a pendência de revisão/publicação deste recorte nos checkpoints abaixo, preservados como histórico.

### Checks externos e baseline independente

- **45/45 testes locais PASS**: **37 ReportShell/mensal + 8 scope**; **typecheck app/node, lint de três arquivos PASS**, **scanner3857/zero**, **build PASS em30.24s**.
- Avisos legados relatados: **bundle5.73MB, imports mistos e Browserslist**; não tratados nesta rodada documental.
- Baseline independente anterior: **27 testes, 26FAIL/1PASS**. É distinta da baseline/intermediária Lovable registrada abaixo; **não somar baselines, checkpoints ou testes repetidos**. Os **35/35 históricos** e **45/45 próprios anteriores** permanecem com sua proveniência, não representam novas execuções neste adendo.

### Browser real externo — PASS apenas de filtros e erro seguro

- **FinanceiroAR**, após reload no site publicado, mostrou no mensal **De01/10/2026 e Até09/10/2026**.
- **Gerar prévia** retornou explicitamente **“Não foi possível gerar a prévia. Verifique seu acesso e tente novamente.”**; **Imprimir desabilitado, sem dados**.
- **PASS focal de filtros/erro, NÃO PASS de geração**. SQL prévio confirma `get_report_monthly_financial authenticated EXECUTE=false`; gate deliberado preservado, sem abertura de grants.
- **Sem exportação, upload ou mutação de dados**. **Mobile UNVERIFIED**: viewport override externo ineficaz e restaurado, sem certificação mobile.
- Proveniência documental local informada pelo executor: **`previa-relatorios-relatorio.md`**, com evidência **`report-shell-mensal-publicado.jpg`**. Referências recebidas, não arquivos/browser inspecionados pelo agente nesta rodada.

### Exportação e limites ainda NO-GO

- Segundo revisão externa Codex, **Edge generate-financial-report v69 ignora erro de `register_financial_report_export`**, cujo `authenticated EXECUTE=false` permanece, **e erro de `createSignedUrl`; PDF trunca**. **Exportação NO-GO**, sem abrir grants nem corrigir Edge/Storage neste adendo.
- **Mensal real/geração, exportação, Financeiro global/B2B/OS/fiscal/Faturamento NO-GO**; matriz integral, demais relatórios/recorrência/Storage/planos, upload/download/bytes e payable UI integral permanecem pendentes/UNVERIFIED. Nenhuma nova fase iniciada.
- Esta rodada alterou **somente roadmap.md e este relatório**; sem código, AGENTS, banco, grants, Edge/Storage, publicação pelo agente ou alteração de gates/fixture. Histórico +40/-40 preservado.

---

## Adendo histórico — revisão focal d784380 — 2026-10-10 01:46 UTC

**Escopo:** somente `ReportShell.tsx`, `RelatorioMensal.tsx`, teste focal existente e documentação. Sem publicação automática: entrega para revisão. AGENTS SHA256 `87175b23cd098b666096675144414ae09791cca353a67fd1fe4d43f41a42b244` intacto; nenhum hook global, outro relatório, rota, grant, banco, migration, Edge/Storage, gate ou fixture alterado. Histórico +40/-40 preservado.

### Três correções focais

1. **Erro seguro de geração:** RPC retornando erro ou promise rejeitada mostra explicitamente, em prévia e toast, somente **“Não foi possível gerar a prévia. Verifique seu acesso e tente novamente.”**. Mensagem crua do servidor não é exibida; prévia/metadados anteriores continuam removidos e lock liberado apenas para a operação atual. Testes verificam tanto mensagem segura quanto ausência do texto cru.
2. **Erro Auth local invalida sessão:** guard do componente combina `access.ready` com ausência de `auth.error`; chave de remount combina o escopo existente com presença de erro. Perda/recuperação do erro limpa filtros sensíveis/prévia/metadados, mesmo com perfil/papéis anteriores persistentes. Capturas da instância desmontada descartam resultados/finally anteriores, inclusive quando nova operação começa após recuperação. Gerar/exportar/imprimir ficam bloqueados durante erro; `useStorageAccessScope` global permanece intacto.
3. **Mensal concreto:** `renderFilters` específico no `RelatorioMensal` associa Labels aos inputs e edita apenas **`_from`/`_to`**. Default usa **`hojeSaoPaulo` já reexportado por `contasReceber`**, em vez de `toISOString()` UTC; primeiro dia calculado a partir do mesmo dia civil. Contratos dos demais relatórios preservados. Testes do componente concreto inspecionam argumentos RPC e filtros da chamada Edge mockada, sem chaves `from`/`to`, e datas na virada UTC: `2026-10-10T01:44Z` → `2026-10-09`; `2026-11-01T01:00Z` → `2026-10-31`; `2026-11-01T03:00Z` → `2026-11-01`.

### Validações próprias e histórico

- **45/45 PASS** em `bun run test src/test/financeiro/reportShell.session.test.tsx src/test/equipe-tecnica/storageAccessScope.test.tsx`: **37** ReportShell/mensal + **8** contrato real do hook, com Auth/RPC/Edge mockados e sem URLs reais. Inclui perda/recuperação de auth.error com perfil persistente, resultados/exportação/finally tardios, operação nova, ações bloqueadas, mensagem segura e argumentos mensais exclusivos.
- Primeira execução desta revisão selecionou caminho inexistente para teste do hook: somente **37/37** executados; rodada final acima usa caminho correto e substitui o checkpoint, sem soma.
- **Lint dos três arquivos funcionais/teste PASS**, **diff-check PASS**; build automático registrado **OK 2026-10-10T01:45:38Z**. Typecheck app/node e scanner separados **NOT RUN** nesta rodada; não inferir PASS a partir de build automático.
- **35/35 anteriores preservados como histórico** no adendo abaixo; não somar repetições. Nenhum novo teste UI autenticado/produção ou SQL executado pelo agente. **PASS mock não certifica geração mensal real, exportação, upload/download ou bytes Storage.**

### Evidência externa Codex recebida, não reexecutada pelo Lovable

- Edge **`generate-financial-report` v69** implantada confere com `index` local; **`getUser` + ANON caller**, segundo adendo do Codex autorizado externamente.
- Bucket **`financial-reports` privado, limite20MiB**; helper Storage **FinanceiroAR com path próprio PASS**, **FSF/Consultor/Superadmin negados**, paths malformados e tenant forjado negados, conforme evidência externa recebida.
- **Nenhum upload/download certificado.** Não houve deploy, leitura remota nem alteração Edge/Storage pelo agente nesta revisão; o adendo não é login/browser nem prova de geração UI.
- **`get_report_monthly_financial authenticated EXECUTE=false` confirmado por SQL externo**, gate deliberado preservado: não habilitar RPC. Prévia mensal real **bloqueada/UNVERIFIED**.
- **Financeiro global/B2B/OS/fiscal/Faturamento NO-GO**; demais relatórios/recorrência/Storage/planos e payable UI integral permanecem pendentes/UNVERIFIED. Aguardar revisão do delta antes de qualquer publicação; nenhuma nova grande fase.

---

## Adendo vigente — contenção focal ReportShell — 2026-10-10 01:40 UTC

**Base informada:** `7bd7ba7b`. Escopo: somente componente existente `ReportShell.tsx`, testes focais e documentação. AGENTS, props, rotas, permissões/grants, backend, Edge, Storage e gates preservados. Nenhuma consulta/mutação remota, publicação/deploy ou operação financeira. Fixture histórica +40/-40 intacta.

### Reprodução baseline própria, antes do fix

Executado `bun run test src/test/financeiro/reportShell.session.test.tsx` contra o componente original: **25/25 cenários FAIL**, antes da alteração funcional. Uso do contrato real `useStorageAccessScope` com Auth simulado e RPC/Edge mockados; sem URLs reais. Falhas concretas: prévia concluída permanece após mudança de escopo, resultados/filtros tardios não descartados, pedido novo fica preso por exportação antiga, erro mantém prévia anterior, filtros editados rotulam resultado antigo, sessão inapta mantém ações habilitadas e clique duplicado chama RPC duas vezes. Não é evidência de novo login/UI publicada ou banco.

### Correção focal e contratos preservados

- `ReportShell` remonta seu conteúdo por **`access.scope`**, derivado exclusivamente do contrato existente; readiness/identidade/tenant/papéis/reportType invalidam a instância anterior, inclusive A→B→A. Sem novo contexto ou permissão inventada.
- Gerar/exportar capturam **`access.capture()`** e token de operação, com lock síncrono compartilhado; resultados, erros e `finally` antigos não modificam operação/instância nova. Desmontagem também invalida capturas.
- Troca de escopo limpa prévia, data de geração, filtros aplicados, filtros sensíveis editados e erros. Cada solicitação clona filtros; a prévia mostra o **snapshot aplicado ao resultado**, não os filtros editados depois. Exportação continua usando seu próprio snapshot dos filtros atuais (UX existente); impressão usa apenas a prévia atual do escopo.
- Gerar começa retirando a prévia/metadados anteriores; erro explícito não deixa relatório antigo parecendo atual. Carregamento, erro, vazio e sessão indisponível são distintos. Sessão inapta ou operação pendente bloqueia gerar/exportar/imprimir; impressão sem resultado não habilitada.
- **Gate mensal deliberado preservado:** `get_report_monthly_financial` continua sem EXECUTE para authenticated. Tratamento de erro local não abre o canal nem certifica prévia mensal. A chamada Edge existente permanece, sem alteração/deploy da Edge ou Storage e sem nova URL/RPC.

### Evidências próprias e limites

- Primeira rodada pós-fix: **33/33 PASS** (25 ReportShell + 8 contrato de escopo), lint dos dois arquivos PASS, build automático **OK01:41:49UTC**. Aviso de `act` em um teste resolvido na revisão do teste; rodada final abaixo substitui esse checkpoint sem somar totais.
- Rodada final própria **35/35 PASS** (27 ReportShell + 8 contrato de escopo), sem avisos `act`; lint dos dois arquivos e diff-check PASS, build automático **OK01:42:23UTC**. AGENTS SHA256 `87175b23cd098b666096675144414ae09791cca353a67fd1fe4d43f41a42b244` intacto. Commit gerenciado observado **`6c29325a5378eed8ffdd90c689631c4c15df2772`** antes deste fechamento documental; não é publicação nem hash final prometido após documentação.
- Testes finais incluem respostas adiadas em identidade/tenant/A→B→A/readiness/reportType, nova geração/exportação antes de finally antigo, filtros, erro/rejeição, loading/vazio, sessão inapta, desmontagem e cliques duplicados. **PASS mock não equivale a UI real, JWT/RLS, exportação/bytes Storage ou concorrência remota**.
- Typecheck app/node separados **NOT RUN**: execução manual de builds/typechecks proibida pelo ambiente; build automático não substitui alegação de comandos separados. Sem PASS externo inventado.
- **Mensal UI real bloqueada/UNVERIFIED; demais relatórios/Edge/Storage/planos e Financeiro global/B2B/OS/fiscal/Faturamento NO-GO integral**, payable UI integral UNVERIFIED. A contenção local de cache/erros não certifica canais remotos.
- Publicação autorizada **somente após revisão deste delta**; aguardar revisão, sem publicar/deploy nesta rodada. Sem nova grande fase.

---

## Adendo documental anterior — relatórios legados/RLS/datas — 2026-10-10 01:36 UTC

**Base e proveniência:** `3c685c397e37a1ddbf2628ca94643ee213bff8f4`. P1, aplicação da migration e retestes foram executados pelo **Codex autorizado externamente ao Lovable**, conforme evidências recebidas; **não pelo humano manualmente nem por este agente Lovable**. Destino informado: Supabase canônico exclusivo `swzpzcwiasxmjutrmvkm`. Apenas SQL fornecido arquivado e roadmap/relatório atualizados nesta rodada; nenhuma execução SQL, alteração remota, frontend, publicação, gate ou fixture pelo agente.

### P1 confirmado externamente — três RPCs legadas bypassavam RLS

Com claims SQL **Admin FSF**, `SELECT accounts_receivable` retornava **zero**, mas:

| Canal legado antes do DDL | Evidência externa recebida |
|---|---|
| `fn_fin_aging` / RECEIVABLE | **2 linhas / total R$150** |
| `fn_fin_dashboard_kpis` | Recebíveis previstos **R$100**, inadimplência **R$150**, pagar vencidas **R$50** |
| `fn_fin_inadimplencia` | **2 linhas** |

As três RPCs eram **SECURITY DEFINER**, com `authenticated EXECUTE=true`, bypassando RLS segundo a prova externa. Não é somente falha de menu, nem certificação integral de todos os canais.

### Migration já aplicada e arquivamento literal

- **`20261010013431 financial_legacy_reports_rls_civil_dates`**, aplicada pelo Codex autorizado no destino canônico informado. SQL literal arquivado em `scripts/rbac-audit/applied-20261010013431-financial-legacy-reports-rls-civil-dates.sql`; **não reaplicar**.
- Total **cinco definições**: `fn_fin_aging`, `fn_fin_dashboard_kpis` e `fn_fin_inadimplencia` passam a **SECURITY INVOKER** e substituem `CURRENT_DATE` pelo dia civil São Paulo.
- `get_financial_dashboard_summary` e `get_top_financial_rankings` já eram INVOKER; somente expressão de data alterada para **`(pg_catalog.now() AT TIME ZONE 'America/Sao_Paulo')::date`**. O SQL fornecido mantém INVOKER implícito nessas duas definições, sem adicionar cláusula ao arquivo literal.
- Sem abertura de grants, nova RPC, mudança frontend/gates ou reescrita do histórico **+R$40/-R$40**. O arquivo é evidência documental das definições fornecidas, não execução pelo Lovable.

### Retestes externos — SQL/claims, temporários revertidos

- Pós-DDL **Admin FSF: zero nos canais RPC**; **Financeiro AR: próprio R$100, A vencer, inadimplência R$0, líquido R$0 (+40/-40)**, conforme relato. O status histórico OVERDUE/data10/10 da fixture não foi reescrito; critérios por data civil nos relatórios não constituem mutação do histórico.
- Teste SQL em **ROLLBACK** criou temporariamente **AR R$37 vencido ontem** e **AP R$23 vencido ontem**, verificando as **cinco RPCs** em fusos de sessão **UTC/Kiritimati/PagoPago**.
- **PASS relatado em todos**: valores de atrasados **R$37/R$23**, vencimento hoje excluído dos atrasados, FSF zero, Consultor e Superadmin negados. Dados temporários revertidos, nenhum novo dado persistido pelos testes relatados.
- São provas **SQL com claims**, não novo login/UI, JWT/browser ou auditoria integral. Nenhum desses testes foi reexecutado pelo Lovable.

### Canal mensal bloqueado, pendências e NO-GO

- `get_report_monthly_financial` permanece **SECURITY DEFINER**, mas **`authenticated EXECUTE=false`** pelo gate existente. **NÃO abrir grant** nem corrigir permissão sem auditoria/autorização específica.
- `ReportShell` invoca esse canal bloqueado: **prévia mensal UNVERIFIED/bloqueada**. `ReportShell.generate` ainda exige auditoria de **cache/troca de identidade e tratamento de erro**; não certificado nem alterado neste recorte.
- **Outros relatórios/B2B/recorrência/Storage/planos NO-GO**; **Financeiro global/OS/fiscal/Faturamento NO-GO** e **payable UI integral UNVERIFIED** preservados. P2 de datas apenas parcialmente contido nas funções centrais e cinco definições atuais, não encerramento integral nem nova grande fase.
- Checks externos **TS/typecheck, lint, scanner e build EM CURSO**; sem PASS inventado ou soma de checkpoints anteriores. Aguardar resultados externos e auditorias autorizadas das pendências, sem operação financeira real.
- **AGENTS e gates preservados**, sem frontend/banco/reaplicação/publicação/fixtures ou alteração do histórico pelo agente.

---

## Adendo documental anterior — datas Financeiro — 2026-10-10 01:29 UTC

**Escopo e proveniência:** referência externa `1a6fa340`. Baseline SQL, aplicação da migration e retestes foram executados pelo **Codex autorizado externamente ao Lovable**, conforme relato recebido; **não pelo humano manualmente nem por este agente Lovable**. Destino informado: Supabase canônico exclusivo `swzpzcwiasxmjutrmvkm`. Esta rodada somente arquiva o SQL literal fornecido e atualiza roadmap/relatório; nenhuma consulta remota, execução/reaplicação de DDL, frontend, publicação ou operação financeira.

### Contrato existente, baseline e DDL aplicado externamente

- `src/lib/financeiro/contasReceber.ts` e `contasPagar.ts` já definem o dia civil **America/Sao_Paulo**, segundo a evidência recebida; os cadastros de AR e FSF confirmaram esse fuso. Não é uma nova regra inventada neste arquivamento.
- Baseline Financeiro em SQL/ROLLBACK falhou **`BAD_DEFAULT_ISSUE_DATE`**: emissão default receivable **2026-10-10**, quando o dia civil São Paulo ainda era **2026-10-09**.
- Migration **`20261010012827 financial_core_civil_dates_sao_paulo`**, já aplicada externamente pelo Codex autorizado. Arquivo literal: `scripts/rbac-audit/applied-20261010012827-financial-core-civil-dates-sao-paulo.sql`; arquivo documental, **não reaplicar**.
- Escopo informado: apenas substituição de `CURRENT_DATE` por **`(pg_catalog.now() AT TIME ZONE 'America/Sao_Paulo')::date`** em sete funções: `fn_recalc_payable_installment`, `fn_recalc_receivable_installment`, `rpc_register_payable_payment`, `rpc_register_receivable_payment`, `fn_reverse_payment`, `fn_mark_financial_overdue`, `rpc_create_financial_title`.
- Corpos restantes, assinaturas, grants, RLS, locks e fences preservados conforme relato. `fn_mark_financial_overdue` continua SECURITY DEFINER tenant-scoped. Sem nova relação, papel, privilégio ou reescrita de dados históricos. O arquivo contém as definições integrais fornecidas, não uma reaplicação pelo Lovable.

### Evidência externa pós-DDL — SQL/claims, tudo ROLLBACK

- Financeiro AR em **três fusos de sessão: UTC, Kiritimati e PagoPago**: PASS relatado para emissão default, baixa default e data do estorno usando o dia civil São Paulo independentemente do fuso da sessão.
- Vencimento no dia civil atual mantém **OPEN** após estorno e rotina overdue, conforme reteste externo.
- Replay e conflito negativo, forja de `organization_id`/`tenant_id`, acessos FSF e Consultor: negações/PASS relatados; histórico com **duas linhas e saldo líquido dos lançamentos zero**.
- Todos esses testes SQL foram revertidos por **ROLLBACK**, sem novos dados persistidos. Claims SQL não equivalem a JWT/browser; não houve UI ou SQL executados pelo Lovable nesta rodada.
- Fixture histórica das **22:22** permanece intacta: original `1586ae07-c74e-4448-85a0-a0e5d6a7d799` **+R$40**, estorno `827122e4-9b3c-4b25-a1b6-9dad2df6ba8d` **-R$40**, título `c898dd90-6303-4bd6-8335-fd155915abaf` / parcela `a88154c0-308d-4366-9f1d-dfcefb730238`, ainda **OVERDUE / data do estorno 10/10**, recebido **R$0 / saldo do título R$100**. Não confundir saldo líquido dos dois lançamentos com saldo devedor do título; o DDL não reescreveu histórico, status ou datas preexistentes.

### P2 parcialmente contido e limites

**P2 NÃO totalmente fechado:** no checkpoint01:29 a contenção relatada cobria somente as sete funções centrais e relatórios/dashboard/recorrência/B2B ainda tinham `CURRENT_DATE`. O adendo01:36 acima amplia focalmente cinco definições de relatórios/dashboard; **outros relatórios, recorrência, B2B, contratos de outros fusos e consistência integral continuam pendentes** de auditoria/autorização específica. A divergência histórica documentada às01:23 não foi apagada nem retroativamente corrigida.

- Checks externos **TS/typecheck, build e scanner EM EXECUÇÃO** no relato atual; nenhum PASS presumido. Checkpoints anteriores permanecem históricos, sem somar suítes repetidas.
- Nenhum novo teste UI pós-DDL comprovado nesta rodada; PASS focal receivable UI anterior preservado com sua proveniência, **payable UI integral UNVERIFIED**.
- **Financeiro global / B2B / OS / fiscal / Faturamento NO-GO**. AGENTS, gates, fixtures e histórico preservados; sem outra fase implementada, baixa, estorno, transferência, cobrança, emissão fiscal ou mensagem real.

---

## Adendo documental anterior — 2026-10-10 01:23 UTC

**Escopo e proveniência:** evidências externas recebidas do usuário, sem UI ou SQL executados por este agente nesta rodada. Fonte `44fa80f4f474f032fb71c6bef416d39b632ef017` publicada, com confirmação UI “Seu site foi atualizado”, conforme relato. Ambiente canônico atual exclusivo: Supabase `swzpzcwiasxmjutrmvkm` e site `https://app.cultivofarm.com.br`. Os ambientes e aceites H6/H7 nas seções antigas abaixo são históricos: não autorizam uso de outros refs nem certificam o Financeiro atual.

### PASS focal — estorno receivable pela sessão real Financeiro AR

- Recebimentos carregou a baixa fictícia de **R$40** após a correção da projeção sem embed bancário. O usuário abriu **Estornar**; **Confirmar** estava desabilitado sem motivo, preencheu o motivo e confirmou **uma vez**.
- Motivo literal: **TESTE AUDITORIA — reversão da baixa fictícia de R$40; sem transferência ou cobrança real.**
- Estorno `827122e4-9b3c-4b25-a1b6-9dad2df6ba8d`, valor **-R$40**, vinculado à baixa original `1586ae07-c74e-4448-85a0-a0e5d6a7d799` de **+R$40**; organização AR `007bb519-cba0-4704-be2c-cb93ad010048`, autoria Financeiro `e19fb370-904b-4342-9d3f-f7983c85ed45`.
- UI mostrou original **Estornado** e negativo **Estorno**, sem botões **Estornar** ou **Emitir recibo** nesses dois lançamentos. Resumo: **recebido R$0 / saldo R$100**. Histórico: **Estorno criado**, com motivo, em **09/10/2026 22:22**.
- SELECT independente relatado confirmou **duas linhas +40/-40**, `received_amount=0` e log `PAYMENT_REVERSAL_CREATED` com autoria e motivo. É evidência SQL externa distinta da UI real externa; não foi reexecutada pelo agente.
- Fixture: título `c898dd90-6303-4bd6-8335-fd155915abaf` / parcela `a88154c0-308d-4366-9f1d-dfcefb730238`, agora **OVERDUE**, não PARTIAL. A baixa R$40 / saldo R$60 / PARTIAL permanece como estado **passado**, anterior ao estorno, sem apagar ou reescrever histórico.
- Alçada **Administrador/Gestor/Financeiro** já definida; não há decisão de alçada pendente. Uma confirmação UI e dois lançamentos não constituem prova nova de concorrência distribuída integral.

### P2 confirmado — inconsistência da data civil / vencimento

Evidência recebida naquele checkpoint: servidor UTC com `current_date=2026-10-10`, enquanto São Paulo ainda estava em **2026-10-09**; `fn_reverse_payment` então usava `current_date`. UI **“Vence hoje”** e KPI **vencido 0** conflitavam com status **Vencido/OVERDUE** e data do estorno **10/10**; histórico exibe **09/10/2026 22:22**. A pendência de identificação da regra foi supersedida pelo contrato existente e DDL central externo do adendo01:29 acima; **auditoria global de consistência continua pendente**. Nenhuma correção de timezone, alteração de rotina ou mudança de históricos foi executada por este agente no fechamento01:23 ou no arquivamento atual.

### Checks e limites de aceite

- Checks finais externos relatados: **47/47 testes de interação do delta PASS**, typecheck app, lint dos dois componentes e teste, scanner **3854 arquivos / zero achados** e build PASS. Typecheck node passou no checkpoint anterior, sem alteração node; não é nova execução nesta rodada.
- **70/70 anteriores = 43 interação + 27 outros**; os 47 atuais incluem os testes de interação anteriores. Não somar checkpoints ou repetir totais como cobertura independente.
- SQLs rollback AR/AP e fences passaram conforme relatos anteriores; mantida distinção entre rollback, testes locais e UI publicada. Não reaplicados nesta rodada.
- **PASS focal receivable UI**; **payable UI integral UNVERIFIED**. **Financeiro global / B2B / OS / fiscal / Faturamento NO-GO**; cadastros globais, recorrências e vínculos, hard-delete legado, mutações integrais, Storage, cache/mobile/planos, valoração e demais cadeias seguem sem certificação global.
- Apenas este relatório e `roadmap.md` atualizados. Código, banco, AGENTS, fixtures, migrations e gates preservados; nenhuma publicação pelo agente nesta rodada. Nenhuma transferência, cobrança, nota fiscal ou mensagem real.

---

## Registro histórico H6/H6b — não constitui aceite do ambiente atual

Ambiente: **staging `ikaauvsflpmamgxmkhoq`**. Produção `navfzbwgwzruipouyfnk` **não foi tocada**
(guard duro em `apply-h6b.sh` e no runner concorrente). H7 **não iniciada**.

## 1. Inventário do fluxo financeiro

| Camada | Objetos canônicos |
|--------|-------------------|
| Títulos | `accounts_receivable` / `accounts_payable` + `*_installments` |
| Baixas | `receivable_payments` / `payable_payments` (append-only desde H6) |
| RPCs de baixa | `rpc_register_receivable_payment`, `rpc_register_payable_payment` |
| Estorno | `fn_reverse_payment(_payment_id,_kind,_reason)` |
| Entrega → AR | `fn_generate_receivable_from_entrega`, `fn_entrega_guard_faturamento_v1`, `rpc_entrega_reconciliar_v1` |
| Snapshot comercial | `partner_order_payment_terms.final_amount` → `partner_orders.final_amount_with_interest` → itens (`preco_unitario_final_snapshot`) |
| Trilha | `financial_audit_log` (leitura restrita a staff financeiro) |

Nenhuma tabela, rota, tela, permissão, categoria, centro de custo, método de pagamento,
conta bancária ou conciliação foi criada em paralelo — todas as correções ocorreram nas
funções canônicas já existentes.

## 2. Findings e situação

| ID | Sev | Achado | Situação |
|----|-----|--------|----------|
| H6-001 | P1 | `idempotency_key` opcional nas baixas AR/AP: retry sem chave criava segunda baixa válida | **Corrigido** |
| H6-002 | P1 | `total_amount` da AR vinha do payload; `valor_faturavel_max` nunca era preenchido na reconciliação | **Corrigido** |
| H6-003 | P2 | Replay de estorno após timeout devolvia erro bruto de unicidade | **Corrigido** |
| H6-004 | P2 | Snapshot econômico de títulos/parcelas | Já protegido em H6; reconferido em H6b (T9) |
| H6-006 | P3 | Mensagem de conflito concorrente pouco descritiva em cenários raros | Aceito (P3) |

### H6-001 — Idempotência obrigatória nas baixas
- `idempotency_key` obrigatória, mínimo 8 caracteres; ausência falha com
  `FIN_IDEMPOTENCY_REQUIRED` (`check_violation`), **antes** de qualquer gravação.
- `request_fingerprint` (SHA-256 dos campos econômicos materiais: valor, desconto, juros,
  multa, método, conta e data) calculado **server-side** e persistido na própria baixa —
  sem tabela paralela.
- Mesma chave + mesmo fingerprint ⇒ **replay**: retorna o `payment_id` existente, sem novo
  efeito contábil. Mesma chave + payload divergente ⇒ `FIN_IDEMPOTENCY_CONFLICT`.
- `FOR UPDATE` da parcela, validação de saldo/status/comprovante e o unique
  `installment_id + idempotency_key` preservados; advisory xact lock determinístico
  acrescentado antes da decisão.
- Frontend (`BaixaDialog.tsx`) gera a chave **uma vez por submissão lógica** e a reutiliza
  em retry/duplo clique.

### H6-002 — Valor faturável derivado server-side
- `fn_entrega_valor_faturavel_v1(entrega)` resolve a fonte econômica histórica na ordem:
  1. `partner_order_payment_terms.final_amount` (termo aprovado) —
     origem `B2B_PAYMENT_TERMS_SNAPSHOT`;
  2. `partner_orders.final_amount_with_interest` — origem `B2B_ORDER_SNAPSHOT`;
  3. soma dos itens aceitos por `preco_unitario_final_snapshot × quantidade aceita` —
     origem `B2B_ITEMS_SNAPSHOT` (usada em entrega parcial com itens de valores diferentes;
     `ratio_aceito` **não** é usado como proporção econômica quando há valor por item).
  Nunca se usa preço atual de catálogo, nem se recalcula juros/desconto com parâmetros atuais.
- `trg_h6b_reconciliacao_valor_faturavel` persiste `valor_faturavel_max`,
  `valor_faturavel_origem` e `valor_faturavel_metodo` na reconciliação.
- `fn_entrega_guard_faturamento_v1` devolve o teto econômico e rejeita total acima dele.
- `fn_generate_receivable_from_entrega` exige paridade do payload com o valor canônico
  dentro de **R$ 0,01**; parcelas continuam obrigadas a somar exatamente o total validado.
  Unique de uma AR ativa por entrega e `FOR UPDATE` preservados.
- Legado sem snapshot resolvível: nenhum preço é inventado — segue o fluxo manual já
  existente, exigindo papel financeiro, motivo e registro em `financial_audit_log`
  (origem, pedido/termo, valor comercial histórico, valor aceito e modo manual).

### H6-003 — Replay de estorno
- `idempotency_key`/fingerprint no estorno; segunda tentativa lógica retorna o estorno
  existente. Intenção divergente (outro motivo/valor) ⇒ `FIN_IDEMPOTENCY_CONFLICT`.
- Estorno duplicado concorrente ⇒ exatamente uma persistência; usuário, data, motivo,
  baixa original e valor registrados na trilha.

## 3. Artefatos

- `supabase/migrations/20260916000000_h6b_financeiro_idempotencia_valor_canonico.sql`
  (migration incremental; nenhuma migration histórica foi editada).
- `restoration/homologacao-h6/apply-h6b.sh` — apply com guard anti-produção.
- `restoration/homologacao-h6/rollback-h6b.sql` — rollback lógico, não destrutivo.
- `restoration/homologacao-h6/46-h6b-postcheck.sql` — postcheck estrutural.
- `restoration/homologacao-h6/45-h6b-concorrencia.mjs` — runner comportamental/concorrente.
- `src/components/financeiro/BaixaDialog.tsx` — chave por tentativa lógica.

## 4. Metodologia dos testes concorrentes

Duas conexões `pg.Client` independentes (não pooled na mesma sessão), cada uma em sua
própria transação com `SET LOCAL ROLE authenticated` e `request.jwt.claims` do usuário-alvo.
As duas transações sincronizam num *barrier* temporal (`pg_sleep` até um instante comum)
para que as chamadas cheguem realmente concorrentes. Fixtures são criadas com prefixo `H6B-…`
e removidas no teardown, que também prova ausência de resíduo.

## 5. Resultados

Postcheck estrutural `46-h6b-postcheck.sql`: **16/16 PASS**.

Runner concorrente `45-h6b-concorrencia.mjs`: **17/17 PASS**

| Gate | Resultado |
|------|-----------|
| T1 AR mesma chave/payload em paralelo | 1 baixa, replay com mesmo `payment_id` |
| T2 AR mesma chave/payload divergente | conflito estável, 1 baixa |
| T3 AR duas chaves, soma > saldo | recebido 800 de saldo 1000, sem overpayment |
| T4a–T4c AP (matriz equivalente) | PASS |
| T4d chave ausente/curta (AR e AP) | fail-closed |
| T5 estorno concorrente | 1 reversão + replay estável |
| T5b estorno com intenção divergente | `FIN_IDEMPOTENCY_CONFLICT` |
| T6 entrega B2B integral | AR única = snapshot 2000 |
| T7 entrega parcial | teto 1000, origem `B2B_PAYMENT_TERMS_SNAPSHOT`, AR = teto |
| T8 payload com total acima e abaixo | rejeitado |
| T9 alteração de parâmetros mestres | AR/parcelas inalteradas (2000 → 2000) |
| T10 entrega `NOT_BILLABLE` | nenhuma AR gerada |
| T11 `anon` nas RPCs financeiras | sem EXECUTE |
| T12 papel sem alçada (`producao`) | baixa e estorno negados (42501) |
| T13 teardown | zero resíduos |

Segurança: todas as funções tocadas são `SECURITY DEFINER` com `search_path` explícito
(postcheck S12) e sem EXECUTE para `anon` (S13). Escopo A×B/partner e RLS de portais
preservados. Produção intocada.

## 6. Regressão

- Binding conferido e restaurado para a baseline de staging `c75bb87f`
  (`.env`, `src/integrations/supabase/client.ts`, `types.ts`) — havia drift para o sandbox.
- Typecheck: **0 erros**.
- Suite Vitest e build: ver seção de execução no relatório de encerramento da conversa.
- Fluxo H5 (entrega/reconciliação), contas a receber/pagar existentes e
  dashboards/cashflow/DRE continuam operando; as proteções H5 de estoque e reconciliação
  permaneceram ativas (o teardown do harness precisou suspendê-las explicitamente,
  o que evidencia que estão em vigor).

## 7. Pendências

- **H6-006 (P3)** — mensagem de conflito concorrente pouco descritiva em cenário raro.
- **P3** — teardown do harness depende de suspender triggers de proteção; é aceitável por
  ser exclusivo de fixtures descartáveis em staging.

## GATE

**H6 — APROVADA COM RESSALVAS** (zero P0/P1; ressalvas P3 acima). **H7 não iniciada.**

---

## H6d — Proveniência/reprodutibilidade (encerramento do GATE H6)

- Migrations canônicas criadas em `supabase/migrations/`:
  `20260917000000_h6c_financeiro_snapshot_b2b_credito.sql` e
  `20260917010000_h6c_backfill_payment_terms_link.sql`.
- `restoration/homologacao-h6/apply-h6c.sh` passa a aplicar as **duas** etapas na ordem,
  com guard duro contra produção.
- Novos: `rollback-h6c.sql` (forward-safe) e o postcheck de paridade
  `49-h6d-paridade-repo-live.sql` + `49-h6d-paridade.sh`.
- Paridade REPO x LIVE provada em transação com ROLLBACK: **6/6 PASS**, backfill no-op,
  nenhuma reaplicação de DDL necessária no staging.
- Histórico `supabase_migrations.schema_migrations` defasado em 48 versões
  (aplicação manual via psql) — **H6D-001 (P2)**, documentado e delegado a H10 sem
  adulteração de metadados.
- Reexecução: H6b 16/16, H6c 13/13, comportamental 12/12, concorrência 17/17,
  typecheck 0 erros, Vitest 3105 passed, build OK, binding `c75bb87f`.
- Produção `navfzbwgwzruipouyfnk` intocada.

**GATE H6 — APROVADA COM RESSALVAS (zero P0/P1). H7 não iniciada.**

---

# H6c-2 — FECHAMENTO DAS RESSALVAS DE EVIDÊNCIA/REVERSIBILIDADE

Ambiente: **staging `ikaauvsflpmamgxmkhoq`** (produção `navfzbwgwzruipouyfnk` intocada). H7 não iniciada.

## H6c-001 — entrega parcial com preços diferentes (agora PROVADO)

Runner: `restoration/homologacao-h6/51-h6c2-multipreco-guard.mjs` — **10/10 PASS**.

Fórmula server-side (`fn_entrega_valor_faturavel_v1`):

```text
base_aceita   = Σ (subtotal_snapshot_item × ratio_aceito_item)
fator         = base_aceita / Σ subtotal_snapshot_item
valor_canonico= round(total_snapshot_comercial × fator, 2)
```

Cenário: item A subtotal 1.000 (ratio aceito 1,00) e item B subtotal 3.000 (ratio aceito 0,50);
total comercial do snapshot 3.600 (com desconto global).
`fator = 2.500/4.000 = 0,625` → **valor canônico = R$ 2.250,00**.
Um ratio global por quantidade (0,75) daria R$ 2.700,00 — **erro de R$ 450,00**, provado em M2.
M3 confere `valor_faturavel_max` gravado (±R$ 0,01) e origem `B2B_PAYMENT_TERMS_SNAPSHOT`;
M4 rejeita payload acima (2.700) e abaixo (2.000); M5 confirma **1 AR exatamente em 2.250,00**;
M6 teardown com **0 resíduos**.

## H6c-002 — rollback integral e reprodutível

- `restoration/homologacao-h6/50-gerar-rollback-h6b.py` gera `rollback-h6b.sql` a partir das
  migrations canônicas: restaura as definições **exatas** de `rpc_register_receivable_payment`,
  `rpc_register_payable_payment`, `fn_reverse_payment`, `fn_entrega_guard_faturamento_v1` e
  `fn_generate_receivable_from_entrega`, remove objetos novos H6b/H6c (helpers `fn_h6b_*`,
  `fn_entrega_valor_faturavel_v1`, triggers `trg_h6b_*`/`trg_h6c_*`) e restaura grants
  (`anon` sem EXECUTE, `authenticated` com EXECUTE).
- `restoration/homologacao-h6/rollback-h6b.sh` automatiza e **falha fechado** fora do staging
  (checa DSN e o marcador `_fiscal_staging_marker`).
- Colunas aditivas (`request_fingerprint`, `valor_faturavel_origem/metodo`) permanecem —
  rollback **lógico**, documentado, sem perda de trilha.
- Postcheck `53-h6b-rollback-postcheck.sql`: **13/13 PASS**.
- Prova `54-h6c-reversibilidade.sh` — **APPLY → ROLLBACK → APPLY: PASS**
  (postcheck H6b 16/16, H6c 13/13; contagens idênticas nos três momentos:
  `50|30|58|30|10|43` baixas AR / baixas AP / AR / AP / reconciliações / vínculos canônicos).

## H6c-003 — guard integral cumpre a própria regra

Migration `20260918000000_h6c2_guard_integral_canonico.sql` (cópia canônica em `supabase/migrations/`):
sem conferência por item, quando há valor canônico resolvível o guard passa a operar em modo
`integral_canonico` e **rejeita divergência acima ou abaixo de R$ 0,01**; sem valor canônico o
modo legado é preservado (o guard não inventa preço). Provas G1 (2.000 exato = PASS),
G2 (2.100 = FAIL), G3 (1.900 = FAIL), G4 (tolerância de R$ 0,01 preservada).

## H6c-004 — retry do comprovante após baixa persistida

`src/lib/financial/anexarComprovanteBaixa.ts`: caminho determinístico
`owner_type/payment_id/idempotency_key-arquivo` + verificação prévia de documento equivalente;
upload com `upsert` no mesmo caminho lógico e violação de unicidade tratada como reuso.
Nenhum comprovante é apagado; bucket e RLS inalterados. `BaixaDialog.tsx` passa a usar o helper.
Teste: `src/test/financeiro/comprovanteBaixaIdempotencia.test.ts`.

## Evidências finais

| Verificação | Resultado |
|---|---|
| Postcheck estrutural `46-h6b` | 16/16 PASS |
| Postcheck `47-h6c` | 13/13 PASS |
| Comportamental `48-h6c` | 12/12 PASS |
| Concorrência `45-h6b` | 17/17 PASS |
| Multi-preço + guard `51-h6c2` | 10/10 PASS |
| Rollback `53` / reversibilidade `54` | 13/13 PASS / PASS |
| Typecheck | 0 erros |
| Vitest | 3111 passed / 4 skipped |
| Build | SUCCESS |
| Binding staging | 8/8 PASS (`ikaauvsflpmamgxmkhoq`) |
| Resíduos H6C2 | 0 (`52-h6c2-limpeza-residual.sql`) |
| `anon` EXECUTE em RPCs financeiras | nenhum |
| SECURITY DEFINER + `search_path` | conforme |
| Produção `navfzbwgwzruipouyfnk` | intocada |

Ressalvas remanescentes: **H6-006 (P3)** mensagem bruta de unicidade em estorno concorrente;
**H6D-001 (P2)** lacuna de `schema_migrations` delegada à H10. Zero P0/P1.

## GATE

**H6 — APROVADA.** H7 (Fiscal) **não iniciada**.

---

# H6d — Correção focada após auditoria independente do H6b/H6c

Ambiente: **staging `ikaauvsflpmamgxmkhoq`** (produção `navfzbwgwzruipouyfnk` intocada).
Migration incremental nova (nenhuma migration histórica editada):
`restoration/homologacao-h6/20260921000000_h6d_financeiro_delete_guard_snapshot_v1.sql`.

> Observação de nomenclatura: o item antes registrado como "H6D-001 (P2) lacuna de
> `schema_migrations`" pertence à frente H10 e não se confunde com os achados H6d abaixo.

## Achados confirmados na auditoria direta

| ID | Sev | Achado | Situação |
|----|-----|--------|----------|
| H6d-001 | P1 | Append-only das baixas só cobria `BEFORE UPDATE`; policies `rp_delete_admin_only`/`pp_delete_admin_only` permitiam DELETE físico por administrador | **Corrigido** |
| H6d-002 | P1 | `accounts_receivable`/`accounts_payable` com policy `ALL` (`Financial staff full access`) permitiam DELETE direto; FKs `ON DELETE CASCADE` destruiriam parcelas e histórico | **Corrigido** |
| H6d-003 | P1 | Guards de parcela protegiam só vínculo/número/`original_amount`; `due_date` e `net_amount` eram editáveis por UPDATE direto | **Corrigido** |
| H6d-004 | P2 | `accounts_receivable.payment_method_id` (condição do título) fora do snapshot imutável | **Corrigido** |

## Correções aplicadas

- **Baixas append-only contra DELETE**: `fn_h6_payments_append_only()` passa a tratar `TG_OP='DELETE'`;
  triggers `trg_h6_rp_append_only` / `trg_h6_pp_append_only` recriados como `BEFORE UPDATE OR DELETE`.
  Policies `rp_delete_admin_only` / `pp_delete_admin_only` removidas e `DELETE` revogado de
  `anon`/`authenticated`. Estorno (`fn_reverse_payment`) segue sendo a única correção operacional.
- **Títulos e parcelas não excluíveis**: novo `fn_h6d_block_hard_delete()` em
  `trg_h6d_ar_no_delete`, `trg_h6d_ap_no_delete`, `trg_h6d_ari_no_delete`, `trg_h6d_api_no_delete`
  (o trigger de linha também dispara na cascata, bloqueando destruição via DELETE do pai).
  Policy `ALL` substituída por `*_select_financial` / `*_insert_financial` / `*_update_financial`
  nas 4 tabelas, sem policy de DELETE, e `DELETE` revogado de `anon`/`authenticated`.
  Cancelamento continua por `rpc_cancel_accounts_receivable` / `rpc_cancel_accounts_payable`
  (`status='CANCELED'`, modelo canônico — nenhum soft-delete paralelo criado).
- **Snapshot de parcelas**: `fn_h6_guard_ar_installment_snapshot` / `..._ap_...` passam a bloquear
  também `due_date`, `net_amount` e `created_at`. Continuam livres os campos derivados de
  baixa/estorno: `received_amount`/`paid_amount`, `discount_amount`, `interest_amount`,
  `penalty_amount`, `status`, `paid_at` (usados por `fn_recalc_receivable_installment` /
  `fn_recalc_payable_installment`).
- **Condição do título**: `fn_h6_guard_title_snapshot` bloqueia mudança de
  `accounts_receivable.payment_method_id` após a criação. Campos fiscais/administrativos
  (`fiscal_invoice_status`, `fiscal_invoice_number`, `fiscal_access_key`, `notes`, `status`, gateway/PIX)
  permanecem atualizáveis por integrações. `receivable_payments.payment_method_id` (método da baixa)
  não foi afetado.
- **Escotilha de manutenção (staging)**: `fn_h6d_hard_delete_allowed()` — fail-closed, exige
  `current_user IN ('postgres','supabase_admin')` **e** `SET arbio.allow_financial_hard_delete='on'`.
  Não alcançável por PostgREST (`anon`/`authenticated`); `EXECUTE` revogado de PUBLIC/anon/authenticated.
  Serve apenas a rotinas internas de rollback/fixture de staging.

Todas as funções são `SECURITY DEFINER` com `search_path` explícito. Nenhuma RPC de
baixa/estorno/faturamento foi redesenhada (`rpc_register_receivable_payment`,
`rpc_register_payable_payment`, `fn_reverse_payment`, `fn_generate_receivable_from_entrega`
preservadas, H5/H6b/H6c intactos).

## Artefatos

- Migration: `restoration/homologacao-h6/20260921000000_h6d_financeiro_delete_guard_snapshot_v1.sql`
- Apply: `restoration/homologacao-h6/apply-h6d.sh` (guard de DSN staging)
- Rollback: `restoration/homologacao-h6/rollback-h6d.sh` + `rollback-h6d.sql`
- Postcheck estrutural: `restoration/homologacao-h6/55-h6d-postcheck.sql`
- Comportamental (fixtures em transação revertida): `restoration/homologacao-h6/56-h6d-comportamental.sql`

## Evidências

| Verificação | Resultado |
|---|---|
| Postcheck estrutural `55-h6d` | **16/16 PASS** |
| Comportamental `56-h6d` (A–H) | **21/21 PASS** |
| A) baixa AR: UPDATE rejeitado, DELETE rejeitado, estorno OK, replay estável | PASS |
| B) baixa AP: idem | PASS |
| C) DELETE de título AR/AP e de parcela por staff financeiro | rejeitado; título/parcela/baixa preservados |
| D) `rpc_cancel_accounts_receivable` / `..._payable` | funcionam e preservam registros |
| E) `due_date`/`net_amount` por UPDATE direto | rejeitado; derivados seguem atualizáveis |
| F) `accounts_receivable.payment_method_id` | rejeitado; método da baixa preservado |
| G) regressão H6 `44` / H6b `46` / H6c `47` / comportamental `48` | 20 PASS / 0 FAIL em todos |
| Reversibilidade APPLY → ROLLBACK → APPLY | PASS (contagens idênticas: `50\|30\|58\|30\|58`) |
| Resíduo de fixtures | 0 (transação revertida) |
| Typecheck | 0 erros |
| Vitest | **3120 passed / 4 skipped** |
| Binding | `ikaauvsflpmamgxmkhoq` (restaurado da baseline `c75bb87f` — drift de sandbox detectado no início) |
| Produção `navfzbwgwzruipouyfnk` | intocada |

## Pendências (P2/P3)

- **P2** — não existe RPC formal de renegociação/reagendamento de vencimento. Com H6d o campo
  ficou fail-closed; se o negócio exigir reagendamento, criar RPC com motivo + auditoria (frente futura).
- **P3** — H6-006: estorno concorrente retorna a mensagem bruta de violação de unicidade.

## GATE

**H6 — APROVADA** (zero P0/P1). Nenhum DELETE físico operacional de baixa ou título é possível;
`due_date`/`net_amount` imutáveis por via direta; sem regressão em baixa/estorno/cancelamento/faturamento.
**H7 não iniciada.**

---

# FASE H6e — PROVENIÊNCIA DA MIGRATION CANÔNICA E MENOR PRIVILÉGIO DAS TRIGGER FUNCTIONS

Ambiente: **staging `ikaauvsflpmamgxmkhoq`**. Produção `navfzbwgwzruipouyfnk` **não foi tocada**
(todas as execuções via `STAGING_DSN` com guard fail-closed nos scripts de apply).

## Achados da auditoria independente (confirmados)

1. **Migration canônica ausente** — a migration H6d existia apenas em
   `restoration/homologacao-h6/20260921000000_h6d_financeiro_delete_guard_snapshot_v1.sql`,
   sem cópia em `supabase/migrations/`, quebrando reprodutibilidade do estado do banco a partir do repositório.
2. **ACL residual** — cinco trigger functions mantinham EXECUTE herdado de PUBLIC, portanto acessível
   a `anon` e `authenticated`.

## ACL antes → depois

| Função (`RETURNS trigger`) | ACL antes | anon/auth antes | ACL depois | anon/auth depois |
|---|---|---|---|---|
| `fn_h6_guard_ar_installment_snapshot()` | `{=X/postgres,postgres=X,anon=X,authenticated=X,service_role=X}` | true/true | `{postgres=X/postgres,service_role=X/postgres}` | false/false |
| `fn_h6_guard_ap_installment_snapshot()` | idem | true/true | idem | false/false |
| `fn_h6_guard_title_snapshot()` | idem | true/true | idem | false/false |
| `fn_h6_payments_append_only()` | idem | true/true | idem | false/false |
| `fn_h6d_block_hard_delete()` | idem | true/true | idem | false/false |
| `fn_h6d_hard_delete_allowed()` | já fechada | false/false | inalterada | false/false |

`service_role` mantido apenas para manutenção server-side controlada. Nenhum trigger foi recriado
e nenhuma lógica funcional foi alterada.

## Arquivos criados/alterados

- `supabase/migrations/20260921000000_h6d_financeiro_delete_guard_snapshot_v1.sql` — **novo** (H6e-001),
  byte-idêntico ao arquivo de `restoration/` (md5 `49f5dfa29155ddac3af78464220d283a`).
- `supabase/migrations/20260922000000_h6e_financeiro_trigger_acl_v1.sql` — **migration nova** (H6e-002), idempotente.
- `restoration/homologacao-h6/20260922000000_h6e_financeiro_trigger_acl_v1.sql` — cópia de execução.
- `restoration/homologacao-h6/apply-h6e.sh` — apply fail-closed (aborta se o DSN não for staging).
- `restoration/homologacao-h6/rollback-h6e.sql` — reversão da ACL ao estado pré-H6e.
- `restoration/homologacao-h6/57-h6e-postcheck.sql` — postcheck estrutural.
- `restoration/homologacao-h6/58-h6e-comportamental.sql` — postcheck comportamental (termina em ROLLBACK).

Nenhuma migration histórica foi editada.

## Paridade repo ↔ live

Reaplicação transacional de H6d + H6e a partir de `supabase/migrations` com `ROLLBACK` final:

| Resultado | Verificação |
|---|---|
| PASS | P1 definições das funções: repo == live |
| PASS | P2 definições dos triggers: repo == live |
| PASS | P3 policies financeiras: repo == live |
| PASS | P4 ACL H6e estável após reaplicar (idempotência) |

Nenhuma diferença entre `restoration/` e o live foi encontrada; nada foi mascarado.

## Testes

**Estrutural (`57-h6e-postcheck.sql`) — 6/6 PASS**: 5 trigger functions sem EXECUTE para PUBLIC/anon/authenticated;
as 5 funções existem e retornam `trigger`; escotilha `fn_h6d_hard_delete_allowed` segue fechada;
10 triggers H6/H6d permanecem vinculados; RPCs financeiras canônicas com `anon=false`,
`SECURITY DEFINER` e `search_path` explícito.

**Comportamental (`58-h6e-comportamental.sql`) — 5/5 PASS**, fixtures descartadas por ROLLBACK (zero resíduo):
guard de título e guard de parcela **disparam normalmente sob `SET ROLE authenticated` mesmo sem EXECUTE**;
DELETE físico de título continua bloqueado; `net_amount` continua imutável.

**Regressão H6d — 16/16 PASS estrutural + 21/21 PASS comportamental** (`55`/`56`), incluindo
UPDATE econômico rejeitado, DELETE de baixa/título/parcela rejeitado, estorno e cancelamento formais
funcionando, idempotência H6b e unicidade de faturamento H5/H6 preservadas. Zero resíduo de fixtures.

**Regressão fiscal H7 — 11/11 PASS** (`60-h7-postcheck.sql`) e **12/12 PASS** (`61-h7-seguranca-ambiente.sql`).
Marcador: `project_ref=ikaauvsflpmamgxmkhoq`, `environment_label=STAGING`, `production_emission_allowed=false`;
`nfe_environment_code` do emitente = `2`; `fn_fiscal_environment_gate_v1` continua bloqueando `tpAmb=1`;
`anon` sem EXECUTE nas funções fiscais. Nenhuma transmissão externa/SEFAZ foi tentada;
certificado A1 continua ausente e o readiness externo permanece **NOT_READY**.

**Repositório**: typecheck 0 erros; Vitest **3120 passed / 4 skipped** (192 arquivos); build **SUCCESS**.
Binding de staging confirmado (`.env`, `client.ts`, `types.ts` com 21.850 linhas restaurados da baseline
`c75bb87f` após drift do sandbox; nenhum segredo exposto).

## GATE H6e

**H6 — MANTIDA APROVADA. H7 — MANTIDA APROVADA COM RESSALVAS EXTERNAS. H6e — APROVADA (zero P0/P1).**
Migration H6d presente no caminho canônico; nenhuma das 5 trigger functions mantém EXECUTE para
PUBLIC/anon/authenticated; sem regressão H6/H7. **H8 não iniciada.**

Pendências remanescentes (inalteradas): **P2** — inexiste RPC formal de renegociação de vencimento
(campo fail-closed); **P3** — mensagem bruta em estorno concorrente (H6-006);
**P2 externo** — emissão SEFAZ dependente de certificado A1 ausente.

---

## FASE H6c (ACL) — Exposição de helpers financeiros SECURITY DEFINER

Execução exclusiva em staging `ikaauvsflpmamgxmkhoq`; produção `navfzbwgwzruipouyfnk` intocada.

### Finding H6-005 (P1) — helpers definer executáveis por `authenticated`

`public.fn_entrega_valor_faturavel_v1(uuid)` e `public.fn_entrega_guard_faturamento_v1(uuid,numeric)`
são `SECURITY DEFINER` com `search_path=public`, **não validam role/escopo do chamador** e mantinham
`EXECUTE` para `authenticated`. Qualquer usuário autenticado podia informar um UUID arbitrário de
entrega e inferir valor faturável, snapshot econômico e condição de faturamento fora do seu escopo.

### Finding H6-006-ACL (P2) — helper de homologação exposto a PUBLIC/anon

`public.fn_h6b_reconciliacao_valor_faturavel()` (helper de reconciliação/homologação) tinha ACL
`{=X/postgres, anon=X, authenticated=X, ...}`. Mantida a função (evidência de homologação necessária),
removida a exposição externa.

### Callers auditados (repositório + banco)

| Caller | Chama | Natureza |
|--------|-------|----------|
| `fn_generate_receivable_from_entrega` | `fn_entrega_guard_faturamento_v1` | interno, SECURITY DEFINER (owner `postgres`) |
| `fn_entrega_guard_faturamento_v1` | `fn_entrega_valor_faturavel_v1` | interno, SECURITY DEFINER |
| `fn_h6b_reconciliacao_valor_faturavel` | `fn_entrega_valor_faturavel_v1` | helper de homologação |

Nenhum caller no frontend (`src/`), nenhuma chamada `.rpc()` direta, nenhum uso em Edge Functions.
Não foi necessário criar RPC substituta nem checagem de escopo adicional (regra 4 não acionada).

### ACL antes / depois

| Função | Antes | Depois |
|--------|-------|--------|
| `fn_entrega_valor_faturavel_v1(uuid)` | `postgres=X, authenticated=X, service_role=X` | `postgres=X, service_role=X` |
| `fn_entrega_guard_faturamento_v1(uuid,numeric)` | `postgres=X, authenticated=X, service_role=X` | `postgres=X, service_role=X` |
| `fn_h6b_reconciliacao_valor_faturavel()` | `=X (PUBLIC), postgres=X, anon=X, authenticated=X, service_role=X` | `postgres=X, service_role=X` |

Nenhuma mudança de lógica: cálculo econômico, `valor_faturavel_max`, precedência de snapshots,
idempotência e estornos permanecem idênticos. Os três helpers seguem `SECURITY DEFINER` com
`search_path=public`; como o owner é `postgres`, as chamadas internas dispensam grant a `authenticated`.

### Artefatos

- `supabase/migrations/20260928000000_h6c_fin_helpers_acl_v1.sql` (canônica, idempotente)
- `restoration/homologacao-h6/20260928000000_h6c_fin_helpers_acl_v1.sql` (cópia de homologação)
- `restoration/homologacao-h6/54-h6c-acl-helpers-apply.sh` (guard duro anti-produção)
- `restoration/homologacao-h6/55-h6c-acl-helpers-rollback.sql`
- `restoration/homologacao-h6/56-h6c-acl-postcheck.sql`
- `src/test/financeiro/h6c.helpersAcl.static.test.ts`

### Evidências de teste

- Postcheck `56-h6c-acl-postcheck.sql`: **12/12 PASS** (anon/authenticated/PUBLIC sem EXECUTE,
  `service_role` preservado, definer + `search_path` mantidos, fluxo canônico e idempotência H6b intactos).
- Comportamental (transação revertida): `H6C-B01` authenticated bloqueado em `valor_faturavel` **PASS**;
  `H6C-B02` authenticated bloqueado no guard **PASS**; `H6C-B03` anon bloqueado **PASS**;
  `H6C-B04` execução interna pelo owner definer continua funcionando **PASS**.
  Em todos os bloqueios o erro é `insufficient_privilege`, sem retorno de metadados financeiros.
- Regressão: `46-h6b-postcheck.sql` **16/16 PASS**; `47-h6c-postcheck.sql` **13/13 PASS**.
- Repositório: `tsgo` 0 erros; Vitest **3253 passed / 4 skipped**; build SUCCESS.

### GATE H6c (ACL)

**H6 — APROVADA (zero P0/P1).** Finding H6-005 (P1) corrigido; H6-006-ACL (P2) corrigido.
Pendências remanescentes (inalteradas): **P2** — ausência de RPC formal de renegociação de vencimento;
**P3** — mensagem bruta de unicidade em estorno concorrente. Produção intocada. **H7 não iniciada nesta execução.**
