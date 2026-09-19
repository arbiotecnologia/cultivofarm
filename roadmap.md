# Roadmap de Tarefas

## H15 — isolamento fiscal por empresa
- [x] Auditar schema vivo, RLS, vínculos e seleção legada de emitente no canônico; 2.145 regressões aprovadas, 4 skips existentes.
- [ ] Implementar H15 transacional com guards pontuais em todos os caminhos SECURITY DEFINER; escopo ampliado autorizado em 19/09/2026. Preparar rollback, testes adversariais e aplicar somente após validação.
- [ ] Verificar estado remoto, advisors e regressões; sem certificado, emissão ou alterações de Edge Functions.
- Evidência e bloqueio: docs/auditorias/fiscal-h15-isolamento-empresa.md. Nenhuma migration H15 submetida/aplicada.

## Rodada H14 — fechamento documental NF-e (2026-09-17)
- [x] Migration `20261037000000` aplicada no canônico após ensaio revertido: bucket `fiscal-xml`, tabela de artefato protocolado com RLS e RPC service_role-only.
- [x] `nfeProc` montado server-side a partir do XML assinado + protocolo da SEFAZ, com validação de chave/ambiente/protocolo, path determinístico e hash.
- [x] Falha de fechamento mantém AUTHORIZED + pendência, sem reenvio; replay idempotente e conflito auditado.
- [x] Harness histórico `hml-b2b-runtime-harness` desativado fail-closed (410).
- [x] 2.081 testes aprovados (única falha: gate do `.env` gerenciado divergente), typecheck, lint e build OK.
- [ ] Deploy real de `fiscal-xml-engine` e `fiscal-sefaz-transport` no canônico — prontas, NÃO publicadas.
- [ ] Acionamento de consulta pós-timeout por tela/rotina.
- [ ] E2E de homologação com certificado real.

## Correção pós-auditoria — 2026-09-17 (H13)
- [x] Fase 0: conexão canônica validada, marcador STAGING e produção bloqueada confirmados, ACLs e ledger lidos em transação somente leitura.
- [x] Fase 1: nome e slogan oficiais em fonte única (`src/config/brand.ts`) e metadados do navegador/redes atualizados; históricos preservados.
- [x] Fase 2: migration `20261036000000` aplicada no canônico após ensaio revertido — `anon` removido de duas funções fiscais, ACLs reafirmadas e retorno SEFAZ resiliente a falha de fechamento.
- [x] Fase 5 (parcial): alvo canônico compartilhado, preflight recusado fora da allowlist, perfil fiscal exigido na borda do motor XML e `verify_jwt` explícito no transporte.
- [x] Evidências: 1.814 testes aprovados, 4 pulados; única falha é o gate do `.env` gerenciado divergente (fail-closed correto).
- [ ] Implantar as duas Edge Functions fiscais somente no canônico: canal de deploy disponível aponta para projeto proibido.
- [ ] Montar e armazenar `nfeProc` e fechar a reconciliação após autorização.
- [ ] Acionamento de consulta pós-timeout por tela ou rotina, para transmissões presas em SENT.
- [ ] DPS/XML/transmissão nacional NFS-e após contrato oficial validado.
- [ ] IBS/CBS permanece fail-closed até leiaute, XSD, vigência, CST e cClassTrib oficiais.
- [ ] Inventário e proposta de baseline/squash das migrations, sem apagar arquivos.
- [ ] Isolar scripts e harnesses históricos que citam projetos antigos.
- [ ] E2E em homologação e `NFeStatusServico4` dependem de deploy, certificado e nova autorização.
- Relatório: docs/auditorias/cultivo-farm-fiscal-correcao-final.md

## Correções fiscais autorizadas — 2026-09-17
- [x] Registrar autorização para conexão e correções; preservar bloqueio de produção.
- [x] Verificar canais disponíveis sem acessar destinos proibidos: credenciais gerenciadas sem alvo canônico comprovado; CULTIVOFARM_DSN e token administrativo ausentes; nenhuma conexão externa de banco listada.
- [x] Confirmar conexão direta ao host canônico: autenticação e SELECT current_database() concluídos; nenhuma alteração no banco.
- [x] Auditar o banco canônico em somente leitura: funções, tabelas, políticas, índices e triggers fiscais inventariados; evidências em docs/auditorias/fiscal-correcao-fase-a-2026-09-17.md.
- [x] Migration `fiscal_transport_preview_safety` aplicada externamente e validada pelo proprietário somente em `swzpzcwiasxmjutrmvkm`; não repetida pelo agente.
- [x] Migration `fiscal_canonical_environment_gate` aplicada externamente no canônico: STAGING, produção bloqueada e transmissão restrita a `service_role`; não repetida.
- [x] H12 (`20261035000000`) aplicada no canônico após validação do marcador no mesmo comando e dry-run revertido: totalização NF-e, certificado por emitente/nota, fechamento de autorização e cálculo próprio NFS-e com snapshots.
- [x] NFS-e integrada à preparação existente com prévia server-side e persistência explícita de ISS, retenções e líquido; sem criar motor ou rota paralelos.
- [ ] Montar e armazenar `nfeProc`; a autorização permanece com reconciliação pendente até esse artefato ser confirmado.
- [ ] Implantar `fiscal-xml-engine` e `fiscal-sefaz-transport` exclusivamente no canônico: endpoints verificados retornaram 404 e não há token de deploy disponível neste ambiente.
- [ ] Implementar DPS/XML/transmissão nacional NFS-e somente após validar contrato oficial/XSD; `nationalTransmissionSupported=false` permanece obrigatório.
- [ ] IBS/CBS: tabela de suporte RTC vazia e gate de leiaute falso; alíquotas não são aplicadas como padrão universal nem serializadas sem leiaute oficialmente validado.
- [ ] Comprovar os dois percursos E2E em homologação após deploy, certificado e fixtures autorizadas; produção e transmissão real continuam bloqueadas.
- [x] Validação local final desta etapa: 1.730 testes fiscais aprovados, 4 pulados; typecheck e build aprovados. Lint dos arquivos alterados ficou sem erros após tipagem do transporte; lint global segue bloqueado por dívidas preexistentes fora do fiscal.
- [x] Auditoria pós-aplicação registrada em `docs/auditorias/fiscal-h12-conformidade-pos-aplicacao-2026-09-17.md`; H12 conforme parcialmente, sem certificação E2E/produção.
- [x] Corrigida referência proibida remanescente no `fiscal-xml-engine` e adicionada guarda canônica antes da criação dos clientes; regressão crítica 35/35.
- [ ] Reafirmar ACLs explícitas de `rpc_fiscal_tax_preview_v1` e `rpc_fiscal_calculate_invoice_v1` em migration nova, somente após reler as ACLs do banco canônico; canal gerenciado atual é proibido.

## Auditoria sequencial de emissão — 2026-09-17
- [x] Auditar NF-e: preparação, cálculo, XML, transmissão, retorno e segurança no código atual.
- [x] Auditar NFS-e após NF-e, distinguindo o fluxo próprio dos caminhos exclusivos de mercadorias.
- [x] Executar testes locais focados: 110 aprovados em 9 arquivos; contratos estáticos/funções puras, não E2E remoto.
- [x] Consolidar achados em docs/auditorias/emissao-nfe-nfse-2026-09-17.md; cálculo/preview NFS-e, IBS/CBS, total NF-e e persistência/retorno com lacunas.
- [ ] Comparar implantação e concluir E2E: bloqueado por canal gerenciado divergente; correções e transmissão dependem de etapa autorizada.
- Inspeção remota bloqueada enquanto o canal disponível não comprovar o destino canônico; sem transmissão, alteração funcional, banco ou publicação nesta auditoria.

## NF-e e NFS-e — ponta a ponta em homologação
- [x] Conferir evidências locais de preparação, cálculo e XML; relatório em docs/auditorias/nfe-nfse-ponta-a-ponta-fase1.md.
- [ ] Comparar implantação real: bloqueado por canal gerenciado divergente; requer acesso comprovado ao banco canônico.
- [ ] Fechar contratos oficiais NF-e/NFS-e e matriz por campo até retorno autorizado; validação integral de fontes/XSD pendente.
- [ ] Fases 2/3: aguardam prompts específicos e autorizações; transmissão somente em homologação.

## NFS-e — valores e tributos, Fase 1 (2026-09-17)
- [x] Auditar campos, snapshots e motor local, incluindo RTC IBS/CBS existente; relatório em docs/auditorias/nfse-valores-tributos-fase1-2026-09-17.md.
- [ ] Concluir contrato oficial para CBS 0,9% e IBS total 0,1%: fontes identificadas, mas leitura integral oficial/XSD/checksum e aplicabilidade pendentes; consulta direta à lei apresentou timeout.
- [ ] Inspecionar schema e permissões implantados somente com conexão comprovada ao canônico; canal gerenciado divergente não pode ser utilizado.
- [x] Consolidar matriz e gates; Fase 1 parcial pelos bloqueios acima, Fases 2/3 aguardam prompt específico. Sem alterações funcionais, emissão ou publicação.

## NFS-e Nacional — N0 (2026-09-17)
- [x] Receber XML e DANFSe reais; conferir estrutura e cálculos da referência sem importar dados pessoais no projeto.
- [x] Consolidar matriz XML × código atual em docs/auditorias/nfse-nacional-n0-2026-09-17.md; cálculos independentes 3/3, sem teste do motor.
- [ ] Concluir N0 no schema implantado: bloqueado até acesso comprovado ao projeto canônico; não usar conexão gerenciada divergente.
- Fases N1 e seguintes não iniciadas; emissão, publicação e alterações de banco não autorizadas nesta etapa.

## Natureza da operação e CFOPs selecionáveis
- [x] Substituir natureza livre por seleção pesquisável com opções personalizadas reutilizáveis.
- [x] Converter CFOP interno e interestadual em seletores do catálogo, preservando legados.
- [x] Reutilizar a seleção de natureza na preparação de rascunhos sem sobrepor resoluções obrigatórias do servidor.
- [ ] Conferência visual autenticada bloqueada pela indisponibilidade temporária da conexão; testes, tipos e build validados.

## Espaçamento uniforme — módulo fiscal
- [x] Padronizar rótulo–controle em 6 px, com alinhamento superior, em 15 arquivos de páginas, abas, filtros e diálogos fiscais, sem mudanças globais. Prontidão não contém rótulos de formulário a ajustar.
- [x] Testes fiscais/config: 1.798 aprovados, 4 pulados, 1 falha no gate de binding por ambiente gerenciado divergente; compilação automática OK. Sem banco ou publicação.
- [ ] Conferência visual autenticada bloqueada pelo gate de binding divergente; corrigir vínculo externo antes de acessar dados. Typecheck isolado não executado por restrição do ambiente.

## CNAEs — harmonia da aba Empresa
- [x] Integrar lista de descrições completas e botão de adicionar ao estilo existente, sem banco ou publicação.
- [x] Testes focados: 9/9; suíte fiscal/config: 1.795 aprovados, 4 pulados, 1 falha de binding; build automático OK.
- [ ] Validação visual autenticada bloqueada pelo gate de ambiente divergente; nenhuma chamada ao banco permitida. Typecheck isolado não executado por restrição do ambiente. Demais tarefas históricas fora deste escopo.

## CQ — alinhamento final 2026-09-13
- [x] Subconjunto seguro aplicado manualmente e pós-check aprovado (relato do usuário; sem banco nesta rodada).
- database=postgres; cq_rows=0; reference_rows=0; RLS das duas tabelas=true; dangerous_grants_remaining=0 (TRUNCATE/TRIGGER/REFERENCES para anon/authenticated).
- fn_cq_ultimo_resultado: security_definer=false, anon_execute=false, authenticated_execute=true.
- fn_validate_envase_cq: anon_execute=false, authenticated_execute=false; trigger existente e habilitado=true.
- cq_h5_ph/cq_h5_concentracao/cq_h5_referencia existentes e validadas: rejeitam NaN/Infinity/-Infinity, faixas inválidas e concentração negativa.
- Período invertido e limite igual verificados visualmente pelo usuário: funcionam.
- [x] SQL Editor sem metacomandos, somente subconjunto seguro; reanálise removida do SQL executável; testes/documentação alinhados.
- Dívidas: atomicidade CQ+avanço e desenho de quarentena/reanálise; NO-GO de homologação desses cenários até desenho e ensaios autorizados.
- Validação local: somente testes CQ e gate de vínculo; build/typecheck pelos sinais automáticos disponíveis. Sem suíte completa.
- Demais módulos e destinos históricos abaixo permanecem suspensos; não executar.

## Lotes — 2026-09-13
- [x] Auditoria local de Lotes, correções de consulta e relatório em restoration/lotes/README.md; 55/55 focados, 134/135 ampliados.
- Pendências Lotes: rastreabilidade completa e snapshot/agregações globais exigem etapa autorizada; E2E conectado proibido. Gate ampliado .env divergente separado do runtime aprovado; typecheck separado sem evidência.
- Constraints numéricas OS aplicadas e validadas manualmente conforme usuário; não reaplicar.

## Ordens de Serviço — 2026-09-13
- [x] Auditoria local e correções frontend; 64/64 testes focados, 114/115 ampliados. Runtime canônico e tipos íntegros.
- [ ] Aceite integral bloqueado pelo gate do .env gerenciado divergente; correção externa necessária. Sem E2E conectado nesta etapa.
- [x] SQL numérico OS aplicado/validado manualmente conforme usuário em 13/09/2026; não reaplicar. Demais riscos de servidor exigem auditoria autorizada.
- H10 aplicado e verificado manualmente pelo usuário; não reaplicar. Trabalhos históricos fora deste escopo permanecem suspensos.

## Aplicações — unidades (correção focada)
- Concluído frontend seguro: bloqueio por unidade ausente no contrato da OS, cálculo dimensional sem conversão, limpeza ao trocar OS e coerência temporal; testes puros 19/19.
- Pendente: habilitação multiunidade exige vínculo persistente OS/prescrição e snapshot de unidade ausentes no contrato atual; não houve alteração de banco.
- Typecheck/build não executados manualmente (restrição do ambiente); log automático segue com erros preexistentes de tipos gerados.
- Bloqueio externo identificado antes das edições: conexão local divergente e tipos gerados com 2.060 linhas; arquivos protegidos não alterados.

## Catálogo na prévia — lote atual
- Tratamento atômico de erros do catálogo e revisão técnica implementado; testes direcionados 24/24.
- Logs da prévia: único destino CultivoFarm; Produtos respondeu HTTP 200 com []. Causa do retorno vazio não comprovada. Validação automática bloqueada por tipos gerados truncados (arquivo protegido); nenhum banco acessado.

## Em aberto

### Anexar evidências locais da P1
- Arquivar em `restoration/promocao-producao-h9/evidencias/`, com SHA-256: `p1-security-invoker-production.sql` e as saídas brutas de pre/post-check das três unidades executadas.
- Arquivar a leitura literal do Security Advisor de produção pós-convergência.
- **Bloqueio:** os arquivos existem apenas na máquina do operador.

### Convergir homologação
- Aplicar `20261006000000`, `20261015000000` e `20261101000000` também em `ikaauvsflpmamgxmkhoq`, para que os dois ledgers avancem juntos.

### Variante H7n específica de produção — onda A1 reclassificada como NO-OP
- Pacote `restoration/promocao-producao-h9/h7n-prod/` gerado e baixado localmente (ZIP SHA-256 `a80832ab0c1cb6c979243b49f45944226f79ca2931b46012295b32f0e44c0d97`). Registros: `restoration/promocao-producao-h9/27-h7n-prod-pacote-variante.md` e `restoration/promocao-producao-h9/28-h7n-prod-a1-noop-evidencia-real.md`.
- **Evidência real de produção (2026-09-10):** censo somente leitura em `navfzbwgwzruipouyfnk` confirmou ledger 493/`20261101000000`, 3/3 views alvo com `security_invoker=true`, ACLs preservadas, schema `private` ausente, 277 `SECURITY DEFINER` para `authenticated`, e objetos ausentes (views de catálogo, `fn_catalogo_preco_canonico`, 4 helpers P2).
- **Veredito A1:** `NO-OP / NAO EXECUTADA` — estado-alvo já existe; não registrar no ledger.
- **Bloqueio A2..A5:** censo de dependências arquivado, diff de corpos das RPCs do P1b, promoção prévia de `fn_catalogo_preco_canonico`, views de catálogo e 4 helpers da P2, e classificação dos 277 SECURITY DEFINER.

### Dry-run H7n-PROD em homologação (preparado, não executado)
- Pacote criado em `restoration/promocao-producao-h9/h7n-prod/dry-run/`: checklist de dependências A2..A5/P2, prechecks somente leitura e plano com 12 gates de aceite. Registro: `restoration/promocao-producao-h9/29-h7n-prod-dry-run-homologacao-preparado.md`.
- **Bloqueio:** o Supabase de homologação `ikaauvsflpmamgxmkhoq` exige novo login autenticado; sem ele nenhum dry-run pode ser executado, nem somente leitura.
- Vereditos preservados: A1 `NO-OP` (fora do ledger), A2..A5 `NO-GO`, P2 `BLOQUEADA`, promoção `NO-GO`.



### Onda P2
- **NO-GO / bloqueada** até autorização explícita, arquivamento das evidências da P1 e dry-run verde da variante H7n.

### Promoção estrutural para o CultivoFarm `swzpzcwiasxmjutrmvkm`
- Pacote de preparação criado em `restoration/promocao-cultivofarm/`: prechecks somente leitura, gerador do baseline estrutural, pós-checks/gates, rollback por onda, runbook local e manifesto de exclusões. Relatório: `restoration/promocao-cultivofarm/10-relatorio-final.md`.
- Escopo: apenas schema, funções, views, RLS, policies, índices e triggers. Sem dados, sem usuários (só `admin@arbio.com` na etapa posterior), sem Storage, sem harnesses, sem as 20 migrations de sandbox.
- Estratégia: baseline por `pg_dump --schema-only` da homologação, não replay das 721 migrations.
- **Bloqueios:** sem canal autenticado para `swzpzcwiasxmjutrmvkm` neste ambiente (execução é local); sessão de homologação expirada impede gerar o dump; backup/PITR do CultivoFarm não confirmado; `.env` do repositório em drift para o sandbox.
- **Ação manual necessária:** obter a connection string e confirmar backups no dashboard do CultivoFarm, habilitar extensões e rodar `supabase link --project-ref swzpzcwiasxmjutrmvkm` localmente.
- Veredito: preparação concluída, promoção **NO-GO**.


## Concluídas
- [x] P0-03A: PWA com atualização obrigatória, tomada automática de controle, recarga protegida contra loop e gate runtime fail-closed para o CultivoFarm; 3.667 testes, typecheck e build aprovados; prévia verificada sem publicação.
- [ ] Concluir binding CultivoFarm `swzpzcwiasxmjutrmvkm`: cliente, guarda fiscal e configuração local estão alinhados, mas a conexão Lovable Cloud ainda regenera `.env` e `types.ts` para o sandbox; requer reconexão externa antes do aceite integral. Emissão fiscal de produção permanece bloqueada.
- **Onda P1 da promoção H9 (produção `navfzbwgwzruipouyfnk`)** — convergência `20261101000000` e authz `20261006000000` / `20261015000000` aplicadas e pós-checadas; ledger 490/`20260723000000` → 493/`20261101000000`; 3 registros `APLICADA`/`P1` em `public.promocao_execucao_registro`; tabelas de convergência com RLS, zero policies, sem SELECT para anon/authenticated, vazias e sem baseline. Registro: `restoration/promocao-producao-h9/25-p1-conclusao-convergencia-e-authz.md`.
- Hardening `security_invoker` das 3 views de produção (P0d), incluindo `public._src_vw_esteira_laboratorio` — mantido explicitamente fora do ledger, sem version fictícia.
- Exportação integral dos artefatos P1 para execução manual local.

- [x] CultivoFarm: pacote determinístico local gerado (20..27) — 314 incluídas, 260 REVISAO_DML, 126 REVISAO_REF_GUARD, 20 sandbox, 1 marker. Promoção NO-GO até revisão humana.
- [x] Logomarca CultivoFarm aplicada na tela `/auth` + favicon; `src/integrations/supabase/types.ts` restaurado do baseline `f3e125c6` (21.850 linhas) após regeneração indevida do Sandbox — typecheck limpo.
- [x] CAT-05: removida superfície destrutiva "Recarregar Catálogo A.R Bio v1.3" de `src/components/protocolos/ProdutosTab.tsx`; teste estático 6/6; typecheck e build OK; binding CultivoFarm preservado.

## Correção da prévia — 2026-09-11
- [x] Contrato TypeScript completo restaurado do baseline f3e125c6 (21.850 linhas); compilação automática build OK e testes direcionados 305/305. Sem acesso ao banco.
- [ ] Regressão às 18:20 UTC: contrato gerado novamente reduzido a 2.060 linhas, com tabelas e colunas ausentes nos erros de compilação. Bloqueio: arquivo gerado protegido contra edição; corrigir a integração geradora antes de restaurar o contrato. Sem acesso ao banco, deploy ou alteração de binding.

## 2026-09-11 19:26 UTC — Restaurar types.ts após build errors pós-CAT-06
- Bloqueio: build-errors.log mostra types.ts truncado (tabelas ausentes: registros_consultor_arquivos, microorganism_targets, formulacoes, etc.).
- Ação: restaurar src/integrations/supabase/types.ts do baseline completo; rodar typecheck/build.
- Restrições: não alterar .env, client.ts, config.toml, banco, migrations, backend.

## 2026-09-12 03:49 UTC — Build errors pós-renomeação da migration comercial
- [x] Corrigido: `src/integrations/supabase/types.ts` restaurado do baseline completo (21.850 linhas).
- [x] Verificado: `.env` aponta exclusivamente para CultivoFarm (`swzpzcwiasxmjutrmvkm`).
- [x] Typecheck limpo; build automático OK; testes focados comerciais + CAT-05/09/10 = 61/61 aprovados.
- Restrições respeitadas: sem acesso a banco, migrations, backend, deploy ou publicação.

## Cockpit Laboratório — auditoria atual
- Correções frontend parciais de estados, filtros, métricas e guardas realizadas; 28 testes focados aprovados; riscos documentados.
- Pendente: homologação completa e compilação limpa, bloqueadas por integração divergente e tipos gerados incompletos. Não executar preview conectado.
- Bloqueio: ambiente divergente e types.ts com 2.060 linhas; arquivos gerados protegidos, restauração exige correção da integração.
- Sem acesso ao banco, publicação ou GitHub; tarefas históricas fora do escopo permanecem suspensas.

- Nova solicitação: corrigir erros de compilação preexistentes; diagnóstico aponta incompatibilidade dos tipos gerados com o contrato canônico. Não mascarar com casts ou alterar arquivos protegidos.

## Proteção CultivoFarm independente do Cloud
- [x] Cópia histórica própria e imports de produção.
- [x] 111 testes aprovados (28 centrais Cockpit, 67 cálculos e 16 vínculo); log automático build OK. Typecheck manual não executado por restrição do ambiente.
- Sem acesso a banco; arquivos gerenciados de ambiente não alterados.

### Validação local do alinhamento final
- CQ: 31 testes aprovados, 0 falhas (21 consulta + 10 hardening), 2 arquivos; exit 0. Gate de vínculo: OK, exit 0. Suíte completa não executada.
- `.env` ausente e ignorado; único createClient operacional preservado no cliente canônico.
- Build automático: build OK; typecheck isolado não executado por restrição do ambiente, sem evidência separada.
- Nenhum acesso/aplicação de banco, criação de dados, publicação ou sincronização GitHub nesta rodada.

## Envase (13/09/2026)
- [x] Correção consolidada de frontend: estados de carga/erro/retry, paginação server-side (50, count exato),
      validação de período, rótulos acessíveis, último CQ determinístico, idempotência estável no complemento,
      remoção da edição de `lotes.volume_produzido`, `defaultValidade` em calendário local.
- [x] SQL idempotente + rollback + README com pós-check real em `restoration/envase/` (subconjunto seguro já
      aplicado manualmente em produção; nada executado nesta rodada).
- [ ] Dívida: atomicidade CQ + avanço de etapa.
- [ ] Dívida: desenho de quarentena/reanálise antes de homologar cenários de reprovação.
- [ ] Dívida: sem dados em `public.envase`, cenários E2E e de concorrência seguem não homologados.

- [x] Refinar Cockpit pontualmente e adicionar testes focados, sem banco ou publicação.

- [ ] Etapa 2: permitir que clientes e parceiros personalizem nome, logomarca e cor nos próprios portais; inclui adequações autorizadas no banco canônico.

## Correção pós-auditoria H14 (somente local)
- [x] Verificar replay Storage, namespaces, espelhos H13/H14 e stub histórico.
- [x] Executar testes e registrar resultados sem deploy ou acesso remoto.
- [ ] Validação integral: binding externo divergente e typecheck separado sem evidência; aguardam ambiente autorizado.
