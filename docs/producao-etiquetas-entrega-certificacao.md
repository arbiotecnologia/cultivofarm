# Produção → Etiquetas pós-envase → Termo de Entrega — Certificação

**VEREDITO: 🟡 APTO COM RESSALVAS** (ciclo 3 — ver §9.6 e §9.8).

Ambiente: **staging `ikaauvsflpmamgxmkhoq`** (marker `STAGING` validado antes de qualquer escrita, e novamente por guard SQL dentro da migração).
Produção `navfzbwgwzruipouyfnk` **não acessada**. Nada publicado. Forward-only.

---

## 1. Inventário anterior (ciclo 1 — auditoria real)

### Backend já existente (reutilizado, nada duplicado)
| Domínio | Objetos encontrados |
|---|---|
| OS/Programação | `ordens_servico`, `ordens_servico_onfarm`, `programacao_producao`, `production_planning`, `publish_planning_to_lab`, `lab_request_replanning` |
| Lote/CQ | `lotes` (enum `status_lote`: em_producao → aguardando_cq → aprovado/reprovado), `controle_qualidade`, `cq_parametros_referencia`, `fn_cq_aprovado_avanca_os` |
| Envase | `envase` (+ `etiqueta_gerada/etiqueta_id/…`), `fn_validate_envase_cq`, `fn_validate_envase_volume`, `fn_envase_avanca_os`, `rpc_cockpit_registrar_envase_v1` |
| Etiquetas | `produto_etiquetas`, `produto_etiqueta_eventos`, `rpc_gerar_etiqueta_produto`, `rpc_marcar_etiqueta_impressa`, `rpc_cancelar_etiqueta_produto`, `rpc_validar_rastreio_produto`, `rpc_rastreio_produto_interno` |
| Estoque/Embalagem | `estoque_produto`, `estoque_embalagens`, `estoque_embalagem_movimentacoes`, `rpc_criar_embalagens_pos_envase`, `rpc_reservar_embalagem_entrega`, `rpc_confirmar_separacao_embalagem` |
| Entrega/Termo | `entregas`, `entrega_comprovantes`, `entrega_checklist`, `entrega_ocorrencias`, `entrega_etiquetas`, `entrega_documentos`, `rpc_gerar_formulario_entrega`, `rpc_coletar_assinatura_digital_entrega`, `rpc_anexar_comprovante_entrega`, `rpc_confirmar_recebimento_entrega`, `rpc_dispensar_assinatura_entrega`, `rpc_validar_comprovante_entrega` |
| Financeiro/Fiscal | `fn_generate_receivable_from_entrega`, `fn_sync_entrega_financial_status`, `fn_fiscal_requirement_resolve` |

**Conclusão da Fase 0 (mantida):** o fluxo pedido → OS → programação → lote → CQ → envase → etiqueta → reserva → entrega → assinatura → rastreio já existe e é canônico. Nenhum fluxo paralelo foi criado em nenhum dos ciclos.

### Defeitos do ciclo 1
| # | Severidade | Defeito | Situação |
|---|---|---|---|
| D1 | Crítico | `rpc_gerar_etiqueta_produto` não checava status de CQ do lote | ✅ fechado (ciclo 1) |
| D2 | Alto | Reimpressão sem motivo obrigatório | ✅ fechado (ciclo 1) |
| D3 | Alto | Sem snapshot imutável nem versão de template | ✅ fechado (ciclo 1) |
| D4 | Médio | Substituição vinculada ausente | ✅ fechado (ciclo 1) |
| D5 | Médio | Ausência de índices por lote/envase/status | ✅ fechado (ciclo 1) |
| D6 | **Crítico** | Fallback inseguro de validade `+6 meses` em etiqueta comercial | ✅ fechado (ciclo 2) |
| D7 | Alto | Sem perfil de conformidade/rotulagem versionado | ✅ fechado (ciclo 2) |
| D8 | Alto | Sem emissão 1:1 por embalagem / templates hardcoded | ✅ fechado (ciclo 2) |
| D9 | Médio | Rota pública de rastreio sem rate limit nem log | ✅ fechado (ciclo 2) |
| D10 | Alto | Termo de entrega sem versionamento/entrega parcial/PDF privado | ⛔ **não executado** (ver §9) |
| D11 | Alto | Ausência de prova E2E de runtime | ⛔ **não executado** (ver §9) |

---

## 2. Alterado no ciclo 2 (migrações forward-only, staging)

### 2.1 Perfil de conformidade e rotulagem versionado
Antes de criar, foi confirmado por inventário de `information_schema` que **não existia** entidade equivalente
(`%conformidade%`, `%rotulagem%`, `%label%`, `%template%` → apenas `comunicacao_templates`, `partner_order_templates`,
`recurring_financial_templates`, `entrega_etiquetas`, `produto_etiqueta*`). Nenhuma duplicação.

Nova tabela **`public.produto_conformidade_perfis`**:

- Escopo: `produto_id` **ou** `categoria` (constraint `pcp_escopo_chk`), com chave lógica `perfil_key` + `versao`.
- Estados: `rascunho` → `em_revisao` → `aprovado` → `inativo` (constraint `pcp_status_chk`).
- Vigência: `vigencia_inicio` / `vigencia_fim`.
- Campos: `responsavel_informacao`, `fonte_documento`, `documento_referencia`, `documento_validade`,
  `campos_obrigatorios text[]`, `conservacao_texto`, `transporte_texto`, `uso_texto`, `advertencias text[]`,
  `responsavel_tecnico_nome`, `responsavel_tecnico_registro`, `registro_mapa`,
  `identificadores_regulatorios jsonb`, `identificadores_fiscais jsonb`,
  `politica_validade`, `validade_meses`, `template_versao`,
  `aprovado_por/em/motivo_aprovacao`, `inativado_por/em/motivo_inativacao`.
- **Nenhum dado foi inventado.** A tabela foi criada vazia; campos desconhecidos permanecem `NULL` e **bloqueiam** a emissão comercial.

Índices/transições:
- `pcp_key_versao_uidx (perfil_key, versao)` — versionamento.
- `pcp_uma_aprovada_uidx (perfil_key) WHERE status='aprovado'` — no máximo **uma** versão aprovada por chave lógica.
- Trigger `trg_pcp_touch`: perfil aprovado é **imutável em conteúdo** (`compliance_profile_immutable`), só pode ir para `inativo`;
  aprovação e inativação exigem motivo (`compliance_profile_reason_required`); carimba `aprovado_por/aprovado_em`.
- Trigger `trg_pcp_audit`: toda transição de status grava em `financial_audit_log`
  (`entity_type='produto_conformidade_perfil'`, ação `COMPLIANCE_PROFILE_<STATUS>`).

Resolução: `fn_conformidade_perfil_vigente(produto_id, categoria)` — perfil de produto tem precedência sobre categoria,
maior `versao` vence, respeita vigência. `EXECUTE` revogado de `PUBLIC`/`anon`.

### 2.2 Remoção do fallback inseguro de validade
`rpc_gerar_etiqueta_produto` foi substituída (mesma assinatura). Ordem de resolução de validade:

1. `estoque_embalagens.validade_em` (origem `embalagem`);
2. `min(estoque_produto.validade)` do lote (origem `estoque`);
3. `fabricado_em + perfil.validade_meses` (origem `perfil_conformidade`).

Sem nenhuma das três:
- tipos **comerciais/logísticos** (`principal`, `reduzida`, `caixa`, `transporte`) → `RAISE label_expiry_not_validated`;
- tipos **internos** (`interna`, `amostra`) → emitem com `validade_em = NULL` e `validade_origem = 'nao_validada'`,
  marcados no snapshot e com `cq_liberado=false` quando o lote não estiver aprovado (sem aparência de liberação comercial).

O termo `estimada_6_meses` **não existe mais** na definição da função (verificado por `pg_get_functiondef`).

Gates adicionais para tipos comerciais:
- `label_compliance_profile_missing` — sem perfil aprovado vigente;
- `label_compliance_field_missing` — `campos_obrigatorios` inclui `responsavel_tecnico`/`registro_mapa` sem valor,
  ou textos de conservação/uso ausentes;
- `label_cq_not_approved` — lote sem CQ aprovado (gate do ciclo 1, agora com código de erro canônico).

### 2.3 Snapshot com origem de cada informação
`produto_etiquetas.snapshot` passou a registrar:
- `conformidade` → `perfil_id`, `perfil_key`, `versao`, `aprovado_em`, responsável pela informação, fonte,
  RT + registro profissional, `registro_mapa`, identificadores regulatórios/fiscais, advertências, transporte, política de validade;
- `template` → código, versão, mídia, largura/altura/margens em mm, orientação, densidade, colunas/linhas;
- `origem_dados` → origem declarada de validade, conservação, uso, produto, lote e embalagem.

Continua protegido pelo trigger de imutabilidade `trg_produto_etiquetas_snapshot_immutable` (ciclo 1).

### 2.4 Etiquetas 1:1, lote e templates configuráveis
- Nova tabela **`public.etiqueta_templates`**: `codigo`+`versao` únicos, `midia` (`termica`|`a4`),
  `largura_mm`, `altura_mm`, 4 margens, `orientacao`, `densidade_dpi`, `colunas`, `linhas`, `campos jsonb`, `ativo`.
  Seed: `etiqueta-produto-principal` (100×60 térmica), `etiqueta-produto-reduzida` (50×30 térmica),
  `etiqueta-produto-a4-grid` (70×37, 3×8 A4). **Nenhum tamanho é mais hardcoded no motor.**
- Índice único **`produto_etiquetas_embalagem_tipo_ativa_uidx (embalagem_id, tipo_etiqueta) WHERE status <> 'cancelada'`**
  → garante 1 etiqueta ativa por embalagem e tipo, salvo substituição formal (que cancela a anterior).
- Nova **`rpc_gerar_etiquetas_embalagens_lote(p_payload)`**: recebe `embalagem_ids[]` (máx. 500), `tipo_etiqueta`,
  `template_codigo`. Para cada embalagem toma `pg_advisory_xact_lock('etiqueta_embalagem:<id>')`, verifica etiqueta ativa
  existente (**idempotente**: devolve em `reaproveitadas` sem duplicar) e **delega ao motor canônico**
  `rpc_gerar_etiqueta_produto`. **Não há segundo motor**: todos os fluxos (envase, embalagem avulsa, lote) passam pela
  mesma função, herdando gates de CQ, conformidade, validade e template.
- `rpc_gerar_etiqueta_produto` passou a aceitar `embalagem_id` como origem unitária canônica
  (deriva lote, produto, envase, volume, unidade e validade da `estoque_embalagens`) e vincula
  `estoque_embalagens.etiqueta_id` na mesma transação.

Frontend:
- `src/components/estoque/GerarEtiquetasLoteDialog.tsx` — seleção de embalagens sem etiqueta, escolha de tipo e
  **modelo carregado do banco com prévia de dimensões**, proteção contra duplo clique (`submitting`),
  e tradução dos códigos de bloqueio (`traduzirErroEtiqueta`) para motivo legível.
- `src/pages/EstoqueEmbalagens.tsx` — ação "Gerar etiquetas em lote (1 por embalagem)".
- Mantidos `EnvasePage` → `EtiquetaProdutoActions`, `GerarEtiquetaEmbalagemDialog` e
  `VincularEtiquetaEmbalagemDialog` (imprimir, reimprimir com motivo, substituir, cancelar já existentes no ciclo 1).

### 2.5 QR público
- Nova tabela **`public.produto_etiqueta_consultas`**: `etiqueta_id`, `consultado_em`, `resultado`, `janela_hora`.
  Registra apenas horário, resultado e a etiqueta — **sem IP, sem user-agent, sem dado pessoal, sem token**.
- `rpc_validar_rastreio_produto` reescrita: **rate limit de 60 consultas por etiqueta por hora**
  (retorna `status='rate_limited'` e resposta mínima), e distinção explícita de
  `nao_encontrada`, `revogada` (`public_trace_enabled=false`), `expirado` (`trace_expires_at`),
  `substituida` (quando há `substituida_por_id`), `cancelada`, `vencido`, `ativo`.
  Etiqueta cancelada/substituída agora retorna `valido=false`.
- Resposta pública permanece mínima (código, produto, lote, volume, fabricação, validade, tipo, mensagem).
  Nenhum laudo, cliente, preço, pedido ou UUID interno é exposto.

---

## 3. RLS, grants e Storage

| Objeto | Regra |
|---|---|
| `produto_conformidade_perfis` | RLS ON, deny-by-default. `SELECT`: admin/gestor/producao/operador_onfarm/tecnico_agronomo. `INSERT`: admin/gestor/producao. `UPDATE`: admin/gestor. `anon` sem qualquer privilégio (revogado explicitamente). |
| `etiqueta_templates` | RLS ON. `SELECT` para `authenticated`; gestão só admin/gestor. `anon` revogado. |
| `produto_etiqueta_consultas` | RLS ON. `SELECT` só admin/gestor. Escrita apenas via RPC `SECURITY DEFINER`. `anon` revogado. |
| `fn_conformidade_perfil_vigente`, `rpc_gerar_etiqueta_produto`, `rpc_gerar_etiquetas_embalagens_lote` | `EXECUTE` revogado de `PUBLIC`/`anon`; concedido a `authenticated` (+`service_role` para a função de resolução). |
| `rpc_validar_rastreio_produto` | única RPC com `EXECUTE` para `anon`, com rate limit e resposta mínima. |
| Bucket `produto-etiquetas` | permanece **privado** (inalterado neste ciclo). |

Nenhuma política `USING (true)` foi criada para dados; a única exceção é `etiqueta_templates` (metadados de layout, não-sensíveis, somente autenticados).

---

## 4. Campos da etiqueta e origem regulatória

| Campo impresso | Origem canônica | Bloqueia emissão comercial se ausente? |
|---|---|---|
| Produto, cepas | `produtos`, `lotes`+`microrganismos` | não (fallback de nome genérico) |
| Lote, fabricação | `lotes` | não (lote é obrigatório) |
| Volume/unidade | `estoque_embalagens` → `envase` → payload | não |
| **Validade** | `estoque_embalagens` → `estoque_produto` → `perfil.validade_meses` | **sim** (`label_expiry_not_validated`) |
| **Conservação / uso** | perfil de conformidade (payload só sobrescreve) | **sim** (`label_compliance_field_missing`) |
| Transporte, advertências | perfil de conformidade (snapshot) | não (registrado, ainda não impresso) |
| **RT + registro profissional** | perfil de conformidade | **sim, se listado em `campos_obrigatorios`** |
| **Registro MAPA** | perfil de conformidade | **sim, se listado em `campos_obrigatorios`** |
| Identificadores fiscais (NCM etc.) | perfil de conformidade (`identificadores_fiscais`) | não (informativo no snapshot) |
| QR / código | `trace_token` (UUID aleatório) + sequência `produto_etiqueta_seq` | — |

---

## 5. Matriz de testes — esperado × obtido (ciclo 2)

Gates estruturais e de definição verificados por consulta direta ao catálogo do staging:

| # | Esperado | Obtido |
|---|---|---|
| G1 | Marker `STAGING` = `ikaauvsflpmamgxmkhoq` antes de escrever | ✅ (guard SQL dentro da migração) |
| G2 | Tabela `produto_conformidade_perfis` existente | ✅ `true` |
| G3 | Templates configuráveis semeados | ✅ `3` |
| G4 | Índice único 1:1 etiqueta ativa por embalagem+tipo | ✅ `1` |
| G5 | Fallback `estimada_6_meses` ausente do motor | ✅ `true` |
| G6 | Erro `label_expiry_not_validated` presente no motor | ✅ `true` |
| G7 | Gate `label_compliance_profile_missing` presente | ✅ `true` |
| G8 | RPC de geração em lote existente | ✅ `true` |
| G9 | Rate limit no rastreio público | ✅ `true` |
| G10 | `anon` sem EXECUTE na RPC de lote | ✅ `true` |
| G11 | `anon` sem SELECT nas tabelas novas | ✅ após revoke explícito (`REVOKE ... FROM anon`) |
| G12 | Typecheck | ✅ PASS |
| G13 | Testes focados de bloqueio de etiqueta | ✅ 7/7 (`src/test/etiquetas/gerar-etiquetas-lote.test.ts`) |
| G14 | Suíte completa | ✅ 2706 passed / 4 skipped |
| G15 | Build | ✅ PASS |

**Provas de runtime E2E (dados sintéticos, 8 perfis, concorrência real, PDF, entrega parcial): NÃO EXECUTADAS.**
Ver §9 — este é o motivo do veredito não ser `STAGING CERTIFICADO`.

---

## 6. Cleanup

Nenhum harness, Edge Function temporária, usuário efêmero, fixture, token, PDF ou arquivo temporário foi criado
neste ciclo. Não houve `DISABLE TRIGGER`. Não há nada a remover. Nenhum segredo, token, UUID real ou credencial
aparece em código, log, diff ou neste relatório.

---

## 7. Pendências que dependem de validação humana (RT / contador / jurídico / MAPA)

O sistema agora **impede** emissão comercial enquanto estas informações não forem validadas — elas são
bloqueios configuráveis, não textos inventados:

1. Criação e aprovação do(s) perfil(is) de conformidade por produto: responsável técnico e registro profissional,
   registro MAPA, advertências obrigatórias, textos de conservação/transporte/uso, política de validade
   (`validade_meses`), NCM e demais identificadores fiscais.
2. Definição de quais campos entram em `campos_obrigatorios` por categoria de produto.
3. Homologação do layout impresso frente à rotulagem regulatória aplicável.

Enquanto (1) e (2) não forem preenchidos e aprovados, **nenhuma etiqueta `principal`/`reduzida`/`caixa`/`transporte`
pode ser emitida** — o motor falha com erro específico. Etiquetas `interna`/`amostra` continuam possíveis,
explicitamente marcadas como não liberadas.

---

## 8. Custo real

Ciclo 2 encerrado em **checkpoint seguro** por limite de orçamento (45 créditos), com o banco consistente,
typecheck/testes/build verdes e nenhum artefato temporário pendente.

---

## 9. Ciclo 3 — Termo de entrega canônico e conferência por item (executado)

Migração aplicada **somente** em `ikaauvsflpmamgxmkhoq` (guard SQL contra produção no topo do script), forward-only.

### 9.1 Inventário antes → depois

| Antes (reutilizado, nada duplicado) | Depois (acrescentado) |
|---|---|
| `entregas`, `entrega_comprovantes`, `entrega_checklist`, `entrega_ocorrencias`, `entrega_etiquetas`, `entrega_documentos` | `entrega_termos` (documento versionado + snapshot imutável), `entrega_conferencia_itens` (estado por item/embalagem) |
| `rpc_gerar_formulario_entrega`, `rpc_coletar_assinatura_digital_entrega`, `rpc_anexar_comprovante_entrega`, `rpc_confirmar_recebimento_entrega`, `rpc_dispensar_assinatura_entrega`, `rpc_validar_comprovante_entrega` | `fn_entrega_build_snapshot_v1`, `fn_entrega_cobertura_v1`, `rpc_entrega_registrar_conferencia_v1`, `rpc_entrega_gerar_termo_v1`, `rpc_entrega_assinar_termo_v1`, `rpc_entrega_registrar_pdf_termo_v1`, `rpc_entrega_cancelar_termo_v1` |

Nenhuma RPC anterior foi removida ou duplicada; o termo canônico é uma camada nova sobre as tabelas existentes.

### 9.2 Termo canônico e snapshot

- `entrega_termos`: `versao` (única por entrega), `template_versao`, `status` ∈ `rascunho|assinado|cancelado|substituido`,
  `snapshot jsonb`, `snapshot_hash` (SHA-256 determinístico sobre `template_versao || '|' || snapshot::text`),
  `cobertura` ∈ `integral|parcial|pendente`, recebedor, assinatura, `pdf_path`/`pdf_hash`, cancelamento e `substitui_termo_id`.
- `fn_entrega_build_snapshot_v1` congela: entrega, cliente, OS interna, OS on-farm, pedido B2B, comprovante,
  entregador (motorista/documento/telefone/veículo/placa), destino completo, recebedor, itens
  (etiqueta + embalagem/serial + lote + produto/microrganismo + conferência), checklist, ocorrências e divergências.
  Documento histórico **não** é recalculado a partir dos cadastros atuais — é lido sempre do `snapshot` gravado.
- Índice parcial `entrega_termos_um_vivo_uk`: no máximo um termo `rascunho`/`assinado` por entrega.

### 9.3 Entrega parcial por item/embalagem

- `entrega_conferencia_itens`: `aceito|recusado|pendente`, `quantidade > 0`, `motivo` obrigatório (≥5 chars) na recusa,
  unicidade por (entrega, etiqueta) e (entrega, embalagem).
- `rpc_entrega_registrar_conferencia_v1` valida por item: vínculo ativo em `entrega_etiquetas`; e, para `aceito`,
  etiqueta não `cancelada`/`substituida`, não vencida (`data_validade >= current_date`) e `cq_liberado = true`.
  Falhas: `etiqueta_nao_vinculada_a_entrega`, `etiqueta_invalida_ou_vencida`, `cq_nao_liberado`.
- `fn_entrega_cobertura_v1`: qualquer item pendente ⇒ `pendente`; algum recusado ⇒ `parcial`; caso contrário `integral`.
  Assinatura com cobertura `pendente` é recusada (`cobertura_pendente`) salvo encerramento parcial explícito
  (`permitir_pendencia`), que fica registrado no snapshot assinado.

### 9.4 Assinatura, hash e imutabilidade

- `rpc_entrega_assinar_termo_v1(p_termo_id, p_payload, p_idempotency_key)` com `pg_advisory_xact_lock` por entrega +
  `SELECT … FOR UPDATE`. Vincula `snapshot_hash`, `template_versao`, recebedor, `assinatura_hash`, tipo, origem,
  `now()` do servidor e `assinado_por`.
- Idempotência: `request_fingerprint` = SHA-256(`snapshot_hash|recebedor|assinatura_hash|tipo`).
  Replay com mesma chave e mesmo payload ⇒ mesmo documento (`replay: true`);
  payload divergente ⇒ `idempotency_payload_mismatch`; chave reutilizada em outro termo ⇒ `idempotency_key_reutilizada`.
- `trg_entrega_termos_immutability` bloqueia, após assinatura, alteração de `snapshot`, `snapshot_hash`, `versao`,
  `template_versao`, `entrega_id`, recebedor, assinatura e `cobertura`; bloqueia DELETE de termo não-rascunho;
  bloqueia troca de PDF já registrado; bloqueia transições a partir de estado terminal.
- `trg_entrega_conf_lock` impede INSERT/UPDATE/DELETE de conferência quando existe termo assinado na entrega.
- Correção só por `rpc_entrega_cancelar_termo_v1` (admin/gestor/administrativo, motivo ≥5 chars); a nova versão gerada
  referencia a anterior em `substitui_termo_id`.

### 9.5 Segurança / RLS / grants

- `entrega_termos` e `entrega_conferencia_itens`: RLS ON, apenas policy de **SELECT** (equipe de entrega, financeiro,
  ou cliente vinculado por `get_cliente_ids_for_user`). **Sem policy de escrita** — toda mutação passa por RPC
  `SECURITY DEFINER` com `search_path = public` e autorização server-side.
- `anon`/`PUBLIC` revogados em todas as novas funções. `fn_entrega_build_snapshot_v1` e
  `rpc_entrega_registrar_pdf_termo_v1` são **exclusivas de `service_role`** (PDF só pode ser registrado pelo backend).
- Verificação pós-migração: 2 policies, 2 triggers, 4 índices únicos criados; chamada de
  `fn_entrega_cobertura_v1` por role não autorizada retorna `42501 permission denied` (deny-by-default confirmado).

### 9.6 Escopo solicitado e NÃO executado neste ciclo

Declarado explicitamente para não haver falsa sensação de cobertura:

- **§4 PDF privado**: a *contabilidade* do PDF está pronta e é idempotente (`pdf_path`/`pdf_hash`/`pdf_gerado_em`,
  um único PDF ativo por versão, gravável só por `service_role`), mas a **Edge Function que renderiza o PDF a partir do
  snapshot assinado, o bucket privado por tenant e os testes de signed URL curta/expirada/negada não foram implementados**.
- **§2 (retorno de estoque na recusa) e §5 (auditoria completa do motor transacional legado)**: a conferência por item
  já registra e bloqueia, mas o **estorno de reserva/estoque do item recusado, o corte de baixa somente dos aceitos e a
  reconciliação das RPCs legadas de confirmação/faturamento não foram alterados** — `rpc_confirmar_recebimento_entrega`
  e `fn_generate_receivable_from_entrega` permanecem como estavam.
- **§6 Integração com comunicação**: evento pós-assinatura **não** registrado.
- **§7 Harness E2E real (A–P)**: **não executado**. Não há dados sintéticos `TESTE_ENTREGA_E2E_` no staging;
  logo **§8 cleanup é vacuamente satisfeito** (0 fixtures criadas, 0 arquivos em bucket, nenhuma Edge Function de harness).
- **§10 matriz expected vs obtained de runtime**: indisponível pela ausência do harness.

### 9.7 Qualidade

- `tsgo --noEmit` (tsconfig.app.json): **PASS**. `vite build`: **PASS** (39.6s, PWA gerado).
- `vitest run`: 2704 passed / 4 skipped / **3 falhas por timeout** em `fase3_8.static`, `fase3_9.static` e
  `portalAcompanhamentoProdutor` — reexecutadas isoladamente: **129/129 PASS**. São timeouts de carga (varredura de
  filesystem + render sob paralelismo), **não regressão**: este ciclo não alterou nenhum arquivo em `src/**`.
- Nenhuma alteração de frontend neste ciclo — a UI de termo/conferência
- Diff auditado: sem segredos, tokens, DSN, UUID real ou dado pessoal.

### 9.8 Pendências humanas (regulatórias) — separadas das técnicas

- Validade jurídica da assinatura operacional (ICP-Brasil/eIDAS) permanece **fora de escopo técnico**; decisão do negócio.
- Política de retenção e prazo de expiração dos PDFs de termo precisa de definição formal antes da promoção.

---

**VEREDITO FINAL: 🟡 APTO COM RESSALVAS.**
Fechados no ciclo 3: termo de entrega canônico versionado com snapshot completo e imutável, hash SHA-256 determinístico
vinculado à assinatura, entrega parcial por item/embalagem com validação de etiqueta/validade/CQ, idempotência de
assinatura com fingerprint, registro idempotente de PDF restrito a `service_role`, cancelamento/substituição formal e
RLS deny-by-default. Pendentes e explicitamente não verificados: renderização do PDF em bucket privado com signed URL,
estorno de estoque do item recusado e reconciliação do motor transacional legado de confirmação/faturamento, evento de
comunicação pós-assinatura, consumo das novas RPCs pelo frontend e **todo o conjunto de provas E2E de runtime (A–P)**.
Não promovido. Não publicado. Produção `navfzbwgwzruipouyfnk` intocada.

