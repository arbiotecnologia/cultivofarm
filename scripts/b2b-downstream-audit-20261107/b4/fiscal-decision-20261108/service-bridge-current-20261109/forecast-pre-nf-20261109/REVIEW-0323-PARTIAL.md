# Complemento 03:23 — resultado parcial, NÃO GO

Somente PostgreSQL 17.11 descartável por socket Unix, restaurações integrais novas; nenhum SQL hospedado, publicação, emissão, cobrança ou envio. A prova 184 permanece histórica, não certifica os candidatos atuais.

## Alterações candidatas

- SYNC/CANCEL exigem READ COMMITTED, duas features canônicas e operações exatas no piloto existente antes/depois dos locks. Instalação sem concessões lifecycle; rollback revoga concessões sem apagar histórico.
- Início canônico candidato reserva EMISSION_STARTED na mesma transação da transmissão e preserva replay antes da reserva nova. Consulta protocolar candidata grava vínculo privado imutável ao evento de timeout, versão da previsão, emissão, NF e XML. Não usa created_at+UUID como causalidade.
- Grant dos helpers privados não foi ampliado. Vocabulário da allowlist foi estendido por constraints pinadas; registros físicos históricos são preservados.
- Constatação READONLY de produção sobre ausência de feature/gate nos helpers c2p1 foi fornecida pelo auditor, NÃO consultada pelo agente. Rótulo INACTIVE não é barreira operacional.

## Execuções preservadas

Evidências: `order-e2e-new-20261108/evidence/attempt-N/run.stdout.txt`, `run.stderr.txt`, `run.exitcode`, `checks.json`.

| Tentativa | Exit | Falha observada |
|---|---:|---|
| 188 | 1 | ModuleNotFoundError do teste de contenção; import corrigido |
| 189 | 1 | 23514: mutação de concessões de outros canais violou shape; mutação restringida ao lifecycle |
| 190 | 1 | PT409 FISCAL_IN_FLIGHT no controle positivo CANCEL; controle agora liquida transmissão via callback em rollback |
| 191 | 1 | P0001 FISCAL_PRODUCTION_ENDPOINT_BLOCKED no BEGIN da consulta: marcador ausente na restauração metadata-only |
| 192 | 1 | 23514 environment_label_check no marcador sintético; label corrigido para STAGING, ainda não reexecutado |

191 completou 48 verificações de contenção em `lifecycle-containment.json`: feature pedidos_b2b/contas_receber, gate, concessão revogada/expirada, referências divergentes, leitura não autoriza lifecycle, controles exatos em rollback e revogação real durante espera de papel, tenant, features e piloto. REPEATABLE READ nos dois wrappers foi negado antes dessas verificações. Auth SQL é sintética, não JWT hospedado.

31 estáticos passaram no espelho; não aprovam cadeia. Artefatos gerados nesse espelho ainda NÃO foram promovidos sobre os SQL históricos do repositório, para evitar apresentar pacote final não validado. Fonte modificada e SQL antigo não devem ser instalados como conjunto.

## Pendências deste candidato

Reexecutar correção STAGING; verificar origem fiscal/causalidade, 215/106/280 e guard imutável, corrida das duas intenções antes SYNC, begin×cancel ambos commits, estrangeiro sem espera, drift ACL executado, 18/9/9, parceiro747→738, pagamento9, callback tardio, preservação dos 38 gatilhos e rollback integral. Nenhum PASS novo desses cenários é declarado.

Leitor `rpc_receivable_money_projection_v1`: fonte candidata `financial-price-generator-20261029/integration/origin.sql.review` revoga authenticated explicitamente. Diagnóstico de catálogo/ator foi adicionado ao ensaio, mas não alcançado nas tentativas novas; positivo continua BLOCKED, sem grant e sem leitura owner como substituto.

Estado: **REVIEW_ONLY_INACTIVE_NOT_APPROVED**.

## Complemento 03:42 — controles distintos e espera comprovada

Incorporado ao mesmo harness; tentativas 193 e 194 executadas sequencialmente, sem processo duplicado e sem hosted. O CANCEL do documento principal continua negando corretamente `PT409 B2B_FORECAST_FISCAL_IN_FLIGHT`: esse resultado registra passagem da autorização e bloqueio de negócio, NÃO sucesso de cancelamento. Não foi liquidada artificialmente a transmissão para passar esse controle.

O sucesso funcional tem controle separado no pedido PC, depois de timeout e consulta canônica 217, exigindo zero transmissões PENDING/SENT, ACK de cancelamento e restauração do estado por rollback. **Esse controle ainda não foi alcançado**; não declarar PASS.

`lifecycle_lock_barrier.py` mantém holder aberto até COMMIT explícito, espera estado idle-in-transaction e só envia revogação depois de observar waiter `wait_event_type=Lock`, holder específico em `pg_blocking_pids` e locks não concedidos em `pg_locks`. Deadline sem essa evidência aborta, termina caller e faz ROLLBACK sem mutação/sem PASS. Pausa curta serve apenas à frequência do poll, não à prova. Dois testes unitários do harness passaram; não substituem PG.

| Tentativa | Exit | Evidência nova / limite |
|---|---:|---|
| 193 | 1 | Restauração sem falhas catalogadas; 48 controles de contenção, incluindo **12 waiters comprovados antes da revogação**; SYNC autorizado em rollback e CANCEL autorizado com bloqueio de negócio PT409. Cadeia parou no BEGIN de consulta com P0001 FISCAL_PRODUCTION_ENDPOINT_BLOCKED. |
| 194 | 1 | Nova restauração integral, sequencial, mesmos 48 controles e 12 waiters comprovados. Configuração da fixture fiscal nova recebeu nfe_environment_code=2 no INSERT, sem alterar snapshots/guards. Mesmo bloqueio fiscal permanece: ajuste insuficiente, não é correção comprovada. |

Evidências exatas em `scripts/b2b-downstream-audit-20261107/order-e2e-new-20261108/evidence/attempt-{193,194}/`: `workspace.json`, `run.stdout.txt`, `run.stderr.txt`, `run.exitcode`, `checks.json`, `restore-results.json`, `lifecycle-containment.json` (PIDs/locks/SQLSTATEs), `fiscal-marker-local.json`. Na 193 também `focused-harness-tests.txt`. Cada cadeia chegou a 47 checkpoints antes da falha; não houve rollback integral final nem PASS financeiro novo.

O marcador canônico STAGING/production_emission_allowed=false foi lido e registrado; o writer canônico também exige configuração fiscal ativa de homologação. A configuração da fixture foi ajustada no INSERT original, mas a 194 demonstra que isso não eliminou o bloqueio. Diagnóstico residual e controle funcional PC seguem pendentes, sem enfraquecer guard ou forçar UPDATE de documento.

**Acoplamento piloto/logística:** o helper existente exige gate `b2b_resale_logistics_gate_v1` além da allowlist. Ativar esse singleton hosted só para testar lifecycle pode afetar capacidades logísticas e NÃO está autorizado. Antes de qualquer piloto hosted, revisar impacto nos consumidores e comprovar contenção exata independente; nenhuma abertura global foi feita ou proposta como atalho. Instalação candidata continua fechada e SQL históricos não foram promovidos.

Permanecem pendentes: controle funcional reconciliado, corridas begin/cancel e duas intenções, causalidade/negativas fiscais finais, drift ACL executado, cadeia 18/9/9 e parceiro747→738, pagamento9, callback tardio/rollback integral/preservação final dos 38 triggers e leitor financeiro positivo. Resultados 184/191 históricos não substituem estas provas; JWT/RLS/Storage hosted, emissão/envio/cobrança reais não foram executados. **NÃO GO.**
## Complemento 12:55 — diagnóstico FISCAL_PRODUCTION_ENDPOINT_BLOCKED (somente local)

**Predicado que falhava (193/194):** `rpc_fiscal_sefaz_transmit_begin_v1` (corpo canônico MD5 `4d93bb04e4a18771ed9185d2f3c5d6dc`, sobreposição candidata linha 32) — cláusula 2:
`SELECT coalesce(nfe_environment_code,'') FROM public.company_fiscal_settings WHERE is_active LIMIT 1` → `''` ≠ `'2'`.
Cláusulas: (1) marcador `project_ref`/`production_emission_allowed` — passava (STAGING/false); (2) configuração ativa LIMIT 1 — **falhava**; (3) host `hnfe.fazenda.mg.gov.br` — estático, passava.

**Causa demonstrada (tentativa 195, `fiscal-begin-preflight.json`, READ ONLY):** duas configurações ativas; a primeira no heap (ctid (0,1)) é a sentinela sintética `10000000-0000-4000-8000-000000000707` da organização `10000000-…-0001` (origem `stock-envase-recovery-20261027/isolated/sentinels.py`), com `nfe_environment_code` NULL. A da ARBio (`00000000-…-0001`, `'2'`) foi inserida corretamente — não houve ON CONFLICT/NOT EXISTS ineficaz para a ARBio. O ajuste do INSERT na 194 nunca poderia resolver: o guard lê configuração de **qualquer empresa**, sem ORDER BY nem tenant.

**Defeito de código (não da fixture):** a cláusula 2 canônica é tenant-blind; em multi-tenant real o bloqueio/liberação de uma emissão depende de outra empresa. A sentinela foi preservada. Correção candidata em `begin_overlay` (`wrappers_and_credit.py`): com documento, `tpamb` vem da configuração ativa **da própria NF** (`c.id=i.company_settings_id AND c.organization_id=i.organization_id`); sem documento, a cláusula canônica fica literal. Ausente/outra empresa ⇒ NULL ⇒ bloqueado. Marcador e host intactos; nenhuma emissão externa.

**Preflight rápido:** `fiscal_begin_preflight` (READ ONLY) roda logo após o INSERT da fixture e antes de cada BEGIN de consulta; aborta em minutos citando o predicado.
**Negativas (tentativa 198, rollback):** própria configuração `'1'`, NULL e inativa com outras empresas `'2'` → `P0001 FISCAL_PRODUCTION_ENDPOINT_BLOCKED`, zero transmissões. A configuração é preparada com `session_replication_role=replica` dentro da transação revertida (mesma costura sintética da fixture) e o writer roda com `origin`.

**Outros defeitos demonstrados e corrigidos no candidato:**
- 196: a cadeia usava SQL `06-install` antigo do repositório (sem READ COMMITTED). `rebuild_current.py` agora gera o candidato **dentro do espelho** (`NEW_E2E_BUILD_FORECAST=1`) e grava `mirror-forecast-artifacts.json` com hashes; o repositório não é promovido.
- 199: `B2B_FORECAST_REPLAY_DIVERGENCE` no segundo ciclo da mesma NF: `attempt` era sempre `1+1`, então a chave de repetição `nota:2` colidia entre transmissões. A transição agora usa `transmission_id` do payload na chave (a NF continua sendo a intenção). A 200 mostrou que trocar a referência quebrava `fiscal_intent_id::uuid`; essa alternativa foi revertida.
- 201a: a segunda intenção da corrida usava fixture com transmissão SENT pré-inserida, que bloqueava o cancelamento seguinte de forma legítima (`FISCAL_IN_FLIGHT`). Agora a segunda NF nasce sem transmissão; só o início canônico pode criar uma.
- `missing-returned-proof`: `response_summary` é NOT NULL (padrão `'{}'`); o caso passou a usar retorno 217 sem `chNFe`.

**Perda de evidência:** dois reinícios do sandbox apagaram os diretórios 195–199 e o primeiro 201. Os resultados acima foram observados durante a execução, mas os arquivos **não estão preservados**; foram renumerados e nada é declarado PASS com base neles. A tentativa 200 está preservada.

### Tentativa 203 — cadeia integral local, exit 0, 55/55 (PostgreSQL 17.11 descartável)

Evidência: `order-e2e-new-20261108/evidence/attempt-203/` (`run.exitcode`=0, `checks.json`, `mirror-forecast-artifacts.json`). Tentativas 200 (22P02 por referência não-UUID, alternativa revertida), 201b (caminho `parents[4]` da captura 184, corrigido para `[5]`) e 202 (início canônico exato bloqueado pela cláusula tenant-blind na reprodução histórica) preservadas com exit 1.

- Preflight: `after-fixture-settings-insert` com cláusula canônica = BLOCK (seleciona sentinela de outra empresa) e cláusula por empresa = `'2'`; consultas com marcador STAGING/false.
- Negativas de ambiente: `begin-env-tenant-scope.json` — 3/3 `FISCAL_PRODUCTION_ENDPOINT_BLOCKED`, 0 transmissões.
- Duas intenções antes do SYNC: vencedora PENDING; perdedora `PT409 B2B_FORECAST_BEGIN_BLOCKED`, sem transmissão (`canonical-begin-cancel-race.json`). begin-first: cancelamento `PT409 B2B_FORECAST_FISCAL_IN_FLIGHT`; replay do início idempotente. cancel-first: início espera e conclui após o rollback do cancelamento.
- 217/negativas: 215/106/280, chave/ambiente/recibo/documento divergentes, RetAutorizacao, resposta antiga, prova ausente/sem chave negados (`wrapper-review-affected.json`); documento/serviço/created_at alterados barrados por `FISCAL_TRANSMISSION_FIELDS_IMMUTABLE`, sem desligar guard. A causalidade usa vínculo begin→timeout, não created_at+UUID.
- Drift de ACL: `B2B_CREDIT_COMPOSITION_POST_ACL` para `b2b_credit_balances(uuid,uuid)` e `b2b_order_residual(uuid)`.
- Contenção: 48 controles, **12 esperas comprovadas** (holder/waiter/`pg_blocking_pids`/locks não concedidos) antes de cada revogação.
- Financeiro: após NF1 título 9 + residual 9 = 18; após NF2 títulos 18 + residual 0 = 18, parceiro 747; após pagamento 9: 9, parceiro **738**. NFs concorrentes: um título e um `FISCAL_AUTHORIZATION_CLOSE_PENDING` (`FISCAL_QUANTITY_OVERALLOCATED` na perdedora).
- Cancelamento + callback tardio: residual cancelado não emitido nem reaberto; callback autorizado preserva protocolo como close-pending sem título. Reprodução histórica: corpo canônico exato bloqueado pelo ambiente; com só a cláusula de ambiente corrigida, iniciaria a emissão do residual cancelado (`before-canceled-begin.json`, revertido).
- Rollback: histórico idêntico antes/depois (3 documentos, 3 snapshots, 3 títulos, 2 close-pending, 40 eventos); dez gatilhos de recebíveis e pins de 120 gatilhos LIVE preservados. **A contagem específica de 38 gatilhos do terms-wait não foi verificada separadamente nesta cadeia.**
- Leitor `rpc_receivable_money_projection_v1`: ACL `{postgres=X/postgres}`, financeiro/administrador `42501`; positivo **BLOCKED_OWNER_ONLY_CANDIDATE_ACL**, sem grant e sem usar leitura do owner como prova.

**Promoção:** depois da 203, o gerador rodou no repositório; os 12 SQL candidatos ficaram byte a byte iguais aos validados no espelho (`review-1255-source-hashes.json`). Os SQL ficam **REVIEW_ONLY_INACTIVE_NOT_APPROVED**: nada de SQL hospedado, publicação, emissão, envio ou cobrança. Auth é SQL sintética (não JWT/RLS/Storage hospedado). Gate logístico global não foi aberto.

## Complemento 14:25 — identidade da emitente antes do ambiente e repetição vinculada (tentativas 204/205, local)

**Auditoria do corpo canônico (MD5 `4d93bb04…`):** a cláusula de ambiente (linhas 31–35) roda **antes** da derivação da nota pelo XML (45–63) e sem escopo de empresa, o que confirma a constatação independente. A repetição (79–94) era devolvida antes de qualquer autorização nova e comparava só o fingerprint. Para Consulta/RetAutorizacao, a nota era o parâmetro do chamador, sem derivação.

**Overlay candidato final (MD5 `210f8b548ad4490da22f59551abaa220`), ordem:** identidade (Autorização pelo XML, como no canônico; Consulta/RetAutorização pelo XML **quando informado**, com `SEFAZ_INVOICE_RUN_MISMATCH`; sem XML, a nota autorizada por `h15_service_actor_invoice_access` no transporte) → ambiente da configuração ativa **exata** da emitente (`company_settings_id` + `organization_id` da nota) → locks nota→pedido→previsão + advisory → autoridade/escopo/features/piloto relidos → repetição → início. Sem documento, só decide a configuração ativa única da empresa do ator; sem ator ou sem configuração, bloqueia. Não existe mais `is_active LIMIT 1`, e o permitido fiscal não foi ampliado (marcador, host `hnfe` e XML `2` intactos).

**Ambiguidade:** o índice único `ux_company_fiscal_settings_active_organization` já impede duas configurações ativas na mesma empresa (23505, comprovado). O `count(*)=1` no writer fica apenas como defesa.

**Repetição:** além do fingerprint, agora exige o mesmo serviço, nota, XML, evento e endpoint (e a mesma empresa do autor, quando não há documento).

**Tentativa 204:** exit 1. O caso de ambiguidade tentou criar uma segunda ativa e foi recusado pelo índice acima, não pelo writer; o caso foi reclassificado.

**Tentativa 205:** exit 0, 55/55 (`order-e2e-new-20261108/evidence/attempt-205/`).
- Repetição (`begin-replay-binding.json`): serviço, nota+XML, evento e endpoint divergentes → `FISCAL_TRANSMISSION_IDEMPOTENCY_MISMATCH`; nota do chamador ≠ XML → `SEFAZ_INVOICE_RUN_MISMATCH`; ator estrangeiro/desconhecido e piloto revogado → `42501 B2B_FORECAST_BEGIN_SCOPE_DENIED`; **revogação do piloto depois de espera real comprovada no lock** → `42501`. Nenhuma linha devolvida nos casos negados; repetição exata depois da restauração = `idempotentReplay=true`; transmissões 5→5 (nenhum envio novo).
- Ambiente (`begin-env-tenant-scope.json`): 8 negativas (própria configuração `1`/NULL/inativa com outra empresa `2`, Consulta sem XML ou com nota divergente, sem documento e sem ator, empresa do ator sem configuração, ambiguidade 23505).
- Regressão: 18/18/9, parceiro 747→747→738, 48 controles de contenção, histórico idêntico (40 eventos) e dez gatilhos preservados.

**Leitura de histórico:** os leitores auditáveis não mudaram. A repetição do início deixou de servir como leitura para quem não tem autoridade atual.

**Tentativa 206 (substitui a 205):** a variante da 205 exigia XML na Consulta/RetAutorização, mas `supabase/functions/fiscal-sefaz-transport/index.ts` envia status/recibo/consulta com a nota obrigatória e `run_id` **opcional**. Isso quebraria o chamador real, então foi descartada. A 206 terminou com exit 0, 55/55: as mesmas 9 verificações de repetição e 8 de ambiente, com `status_invoice_only_issuer_env_1` (só a nota, emitente em `1`, outra empresa em `2`) → bloqueado. Nas previsões, a consulta sem XML continua barrada pela prova causal (`t.xml_run_id=_xml_run_id`).

**Promoção:** 12/12 SQL iguais aos do espelho validado na **206** (`review-1425-source-hashes.json`). Pacote **REVIEW_ONLY_INACTIVE_NOT_APPROVED**; sem SQL hospedado, publicação, emissão, envio ou cobrança. Auth sintética.

## Complemento 15:11 UTC 10/11/2026 — revisão 890bfa4/206

Somente PostgreSQL 17.11 descartável; Auth sintética (SQL-role authenticated/service_role, perfis sintéticos). Não é prova JWT/RLS/Storage hospedada nem SEFAZ. Sem SQL hospedado, publicação, emissão, envio ou cobrança. Status: `REVIEW_ONLY_INACTIVE_NOT_APPROVED`.

Tentativas: 207 exit 1 (mapa dos 38 medido antes de os pacotes de embalagem/catálogo serem compostos: 6 ausentes; passou a ser só registro nesse ponto); 208 exit 1 (`fiscal_xml_runs_env_chk` fixa ambiente 2; caso trocado para perda de assinatura); **209 exit 0, 56/56**.

1. CANCEL COMMIT→BEGIN: `cancel-commit-then-begin-denied.json` — waiter comprovado (pg_blocking_pids), `PT409 B2B_FORECAST_BEGIN_BLOCKED`, transmissões 6→6, `cancelado_residual`, residual 0. O caso rollback continua separado em `canonical-begin-cancel-race.json`.
2. Revalidação pós-espera (`begin-post-wait-revalidation.json`, 6 casos com waiter): configuração da emitente em 1 e inativa, marcador revogado → `FISCAL_PRODUCTION_ENDPOINT_BLOCKED`; XML perde assinatura → `SEFAZ_INVOICE_RUN_MISMATCH`; perfil inativo e piloto revogado (RetAutorização) → `42501`. O piloto é avaliado antes dos demais checks, todos após as esperas. Nenhuma linha devolvida; transmissões e previsão inalteradas.
3. Ator estrangeiro (Autorização e RetAutorização) negado `42501` sob `lock_timeout=400ms` sem `55P03`: não esperou linhas alheias.
4. RetAutorização entra no bloco de autoridade; o pré-check do transporte (`h15_service_actor_invoice_access`, corpo capturado) dá foreign=false/own=true; positivo próprio passou em rollback. A edge function não foi executada.
5. Leitor `rpc_receivable_money_projection_v1`: consumidor é `receivableOrigin.ts` diferido (não montado no src atual). Candidato 13–16 (`projection_reader.py`): helper privado sem grants (h15 org ativa + `is_financial_staff` + `contas_receber`), EXECUTE só para authenticated. Positivos financeiro/admin próprios; negativos estrangeiro, comprador, anon, service_role, helper direto, feature revogada e perfil inativo; rollback restaurou MD5 `7c5d3fa0…` e ACL `{postgres=X/postgres}`. Pin PRE é derivado localmente e precisa de captura somente leitura. Gestor é aceito pela regra canônica `is_financial_staff`.
6. 38 gatilhos mapeados por nome/tabela/definição/habilitação: `triggers38-before-forecast-scenarios`, `-before-final-rollback`, `-end` todos íntegros.
7. Gate logístico global não aberto.

Regressão: parceiro 747→738 após pagamento 9; títulos 9→18, residual 9→0; rollback com histórico e dez gatilhos preservados. Início fiscal candidato MD5 `38bc13e60350f7117af798c3630d0aef`. 16 SQL do repositório idênticos ao espelho validado: `review-1511-source-hashes.json`. Evidência: `scripts/b2b-downstream-audit-20261107/order-e2e-new-20261108/evidence/attempt-209/`.

## Revisão 209/584d530 — ajustes finais (10/11/2026)

Tentativas: 210 exit 1 (PL/pgSQL `IF` cortado no `THEN` do `CASE` do ACL normalizado → expressão parentizada); 211 exit 1 (rollback com helper=false quebrou pagamento 9: `42501 MONEY_ORIGIN_ACCESS_DENIED`, pois `rpc_register_receivable_payment` chama o leitor); **212 exit 0, 56/56 PASS**, PostgreSQL 17.11 descartável, Auth sintética.

1. Início fiscal: `resale_pilot_allowed_v1` agora roda antes de marcador, XML/assinatura e configuração da emitente; perfil/papéis/features continuam depois; tudo antes de replay/INSERT. Oito casos novos com holder segurando SÓ a linha da allowlist ou SÓ a linha do gate (waiter comprovado por `pg_blocking_pids`): ambiente 1, configuração inativa, marcador revogado → `FISCAL_PRODUCTION_ENDPOINT_BLOCKED`; assinatura removida → `SEFAZ_INVOICE_RUN_MISMATCH`. Transmissões 6→6, previsão inalterada. Overlay begin MD5 `a4074519c0185b67bc0aad0303153fb1`.
2. Leitor: PRE/POST pinam corpo+owner+ACL normalizada do RPC, helper e cinco dependências; `is_financial_staff` = LIVE `6e8f2fa7…` conferido. Helper estranho pré-existente → `HELPER_PREEXISTS` (PRE e INSTALL); drift de ACL de dependência → `DEP_DRIFT`. Positivos financeiro/administrador/gestor próprios; negativos gestor e admin estrangeiros, comprador, anon, service_role, helper direto, feature revogada, perfil inativo. Rollback valida candidato, só revoga authenticated (RPC `725f5790…` ACL `postgres:EXECUTE:postgres`), não restaura `7c5d3fa0…`; segunda execução falha fechada.
3. Regressão: parceiro 747→738 após pagamento 9; aberto 9→18→9, residual 9→0; 38 gatilhos íntegros antes dos cenários, antes do rollback final e no fim.
4. UI: só `get_b2b_financial_forecast_secure` está montado (somente leitura); SYNC/CANCEL e leitor não têm tela. Não há fluxo real completo.

Manifesto: `final-manifest-20261110.json`; hashes: `review-1539-source-hashes.json`. Pacote `REVIEW_ONLY_INACTIVE_NOT_APPROVED`; sem GO hospedado.
