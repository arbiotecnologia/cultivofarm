# Auditoria independente — agrupamento "Visão Geral"

**VEREDITO: `APTO COM RESSALVAS` (staging `ikaauvsflpmamgxmkhoq`).**
O veredito anterior `STAGING CERTIFICADO` do commit `50bec4d3eed55222b3503af1055e4a31870b3143` é **rejeitado e revogado**: não havia relatório, harness, dados sintéticos, matriz A–T, provas por perfil, medição de performance nem evidência de suíte completa. Este documento substitui aquela afirmação.

- Ambiente auditado: staging `ikaauvsflpmamgxmkhoq`. Produção `navfzbwgwzruipouyfnk` **não foi acessada**.
- Nada foi publicado nem promovido.
- Data: 2026-08-03.

---

## 1. Inventário do agrupamento

Fonte: `src/config/navigation.ts` (grupo `Dashboard`), `src/App.tsx`, `src/lib/permissions.ts`.

| Rota canônica | Aliases/legado | Componente | Perfil autorizado |
|---|---|---|---|
| `/dashboard/geral` | `/` | `DashboardUnificado` → `VisaoGeral` | administrador, gestor |
| `/dashboard/executivo` | `/executivo`, `/portal-executivo` | `DashboardUnificado` → Portal Executivo (lazy) | administrador, gestor |
| `/dashboard/operacional` | `/painel-operacional` | `DashboardUnificado` → Painel Operacional (lazy) | administrador, gestor |
| `/portal` | — | Portal do Produtor (fora do escopo do gate) | cliente_produtor |

`DashboardUnificado` usa abas que apenas navegam entre as três rotas-filhas, preservando `search`/`hash`; as visões Executiva e Operacional são carregadas sob demanda.

### Elementos da página `VisaoGeral`

| Bloco | Elementos |
|---|---|
| A — Cards executivos | Saúde Operacional (score+classificação), Alertas, Receita recebida, Clientes ativos |
| B — Prioridades imediatas | Solicitações críticas → `/solicitacoes?urgencia=critica`; Visitas atrasadas → `/agenda-tecnica` |
| C — Fluxo do dia | Check-ins hoje, Visitas hoje, OS abertas, Recomendações pendentes |
| D — Situação do Laboratório | OS aguardando, Lotes em produção, CQ pendente, Envases pendentes, Insumos críticos, Entregas pendentes |
| E — Acesso rápido | Visão Executiva, Visão Operacional, BI Agronômico, BI Operacional, Relatórios |

Não há filtros de período/cliente/fazenda na `VisaoGeral`: o período é **fixo em 30 dias** no código (`useExecutivoResumo({ periodo: "30_dias" })`). As visões Executiva e Operacional possuem seus próprios filtros e não foram alteradas neste ciclo.

---

## 2. Revisão da migration e das RPCs do commit

### ACL (evidência SQL, `pg_proc.proacl` + `has_function_privilege`)

| Função | anon | authenticated | service_role | SECURITY DEFINER | search_path |
|---|---|---|---|---|---|
| `rpc_executivo_resumo_geral(jsonb)` | ❌ | ✅ | ✅ | sim | `public` |
| `rpc_dashboard_geral_lab_resumo()` | ❌ | ✅ | ✅ | sim | `public` |
| `is_executivo(uuid)` | ❌ | ✅ | ✅ | sim | `public` |

Não existem overloads antigos: a busca por `regprocedure` retornou exatamente uma assinatura por nome.

### Escopo organizacional / multiempresa

Evidência: apenas `public.profiles` possui coluna de escopo (`organization_id`); nenhuma das tabelas consultadas pelos KPIs (`alertas_operacionais`, `lotes`, `entregas`, `estoque_embalagens`, `estoque_produto`, `ordens_servico_onfarm`, `clientes`) possui `tenant_id`/`organization_id`/`unidade_id`, e `public.organizations` contém **1 registro**. Logo a leitura consolidada é, hoje, correta por construção — **mas é uma dependência frágil**: ao introduzir a segunda organização, todas as contagens globais tornam-se vazamento horizontal. Registrado como risco ALTO condicional (R-01).

Filtros `cliente_id`/`fazenda_id` são apenas **redutores** de escopo sobre um conjunto já consolidado e o acesso é restrito a administrador/gestor (perfis que legitimamente veem tudo). Não há, portanto, injeção horizontal por query-param **enquanto** o sistema for monoempresa.

### Defeitos encontrados e corrigidos nesta auditoria

| ID | Severidade | Defeito | Correção |
|---|---|---|---|
| D-01 | ALTO | `alertas_criticos`/`alertas_altos` usavam `status NOT IN ('resolvido','cancelado','fechado')` — valores `cancelado`/`fechado` **não existem** no CHECK da tabela (`aberto,lido,resolvido,ignorado,reaberto`) e `ignorado` era contado como aberto; já `alertas_ativos` excluía `ignorado`. Card "Alertas" incoerente com as gravidades. | Conjunto canônico único `('aberto','lido','reaberto')` nos três indicadores. |
| D-02 | ALTO | `periodo=personalizado` com data pura (`YYYY-MM-DD`) convertia `data_fim` em 00:00 → **último dia inteiro excluído**; sem validação de intervalo invertido. | `data_fim` inclusiva (fim do dia em `America/Sao_Paulo`); erro explícito para `data_inicio > data_fim` e para período personalizado sem datas. |
| D-03 | MÉDIO | `EXCEPTION WHEN OTHERS` silencioso: falha estrutural era indistinguível de zero. | Novo campo `diagnostico[]` com `indicador` + `SQLSTATE`, `RAISE WARNING` no log do Postgres, e o frontend passou a exibir "Indisponível" (não `0`) para as fontes listadas em `dados_indisponiveis`. |
| D-04 | MÉDIO | Drill-downs com query-params que a página de destino ignora: `/lotes?status=em_producao`, `/agenda-tecnica?filtro=atrasadas`, `/ordens-servico?status=aberta`. | `/ordens-servico` passou a aceitar `?status=` (validado contra `STATUS_PIPELINE`); os parâmetros não suportados de `/lotes` e `/agenda-tecnica` foram removidos para não prometer filtro inexistente. |
| D-05 | BAIXO | `insumos_criticos` compara `SUM(estoque_produto.volume_total)` com `produtos.estoque_minimo` sem coluna de unidade em `produtos`. | Não há divergência de unidade possível hoje (não existe coluna de unidade); a premissa "ambos em litros" ficou registrada em `COMMENT ON FUNCTION`. Permanece ressalva de modelagem. |

### Paridade financeira

`receita_recebida` usa exatamente a mesma base de `rpc_executivo_financeiro_resumo.total_recebido`: `receivable_payments` com `is_reversal = false`, join até `accounts_receivable`, recorte por `payment_date` (date) e filtro opcional por `customer_id`. Diferença remanescente (documentada): a RPC financeira usa `current_date` (UTC do servidor) e a geral usa a data em `America/Sao_Paulo` — divergência possível apenas na janela 21h–00h BRT. Pagamentos parciais são somados por natureza (uma linha por pagamento); estornos são excluídos; ausência de parcelas resulta em 0 legítimo.

---

## 3. Matriz KPI × fonte × fórmula (VisaoGeral)

Timezone de negócio: `America/Sao_Paulo`. Perfil autorizado em todos: administrador, gestor.

| KPI exibido | Fonte canônica | Fórmula | Recorte | Drill-down | Reconciliação |
|---|---|---|---|---|---|
| Saúde Operacional | derivado | score 95/70/40/0 conforme alertas críticos, SLA vencidos e pendências | Agora | — | recalcular pelas regras da RPC |
| Alertas | `alertas_operacionais` | `count(status ∈ aberto,lido,reaberto)` | Agora | `/alertas-operacionais` | `SELECT count(*) …` |
| Receita recebida | `receivable_payments`+`…installments`+`accounts_receivable` | `SUM(amount_received)` sem estornos | 30 dias | `/financeiro` | idem RPC financeira |
| Clientes ativos | `clientes` | `count(status_cliente='ativo')` | Agora | `/clientes` | `SELECT count(*)` = **2** |
| Solicitações críticas | `portal_solicitacoes` | `urgencia='critica'` e status não terminal | Agora | `/solicitacoes?urgencia=critica` ✅ suportado | — |
| Visitas atrasadas | `vw_fluxo_visita_tecnica` | previsão vencida e sem check-in | Agora | `/agenda-tecnica` ⚠️ sem filtro equivalente | — |
| Check-ins hoje | `visitas_checkin` | data do check-in = hoje (BRT) | Hoje | — | — |
| Visitas hoje | `registros_consultor` | `data_vistoria = hoje`, status não arquivado/reprovado | Hoje | — | — |
| OS abertas | `ordens_servico_onfarm` | `status='aberta'` | Agora | — | `count = 0` |
| Recom. pendentes | `vw_fluxo_visita_tecnica` | `proxima_acao ∈ (Emitir/Liberar recomendação)` | 30 dias | — | — |
| OS aguardando (lab) | `ordens_servico_onfarm` | `status='aberta'` | Agora | `/ordens-servico?status=aberta` ✅ (corrigido) | `count = 0` |
| Lotes em produção | `lotes` | `status='em_producao'` | Agora | `/lotes` ⚠️ sem filtro | `count = 1` |
| CQ pendente | `lotes` | `status='aguardando_cq'` | Agora | `/controle-qualidade` ⚠️ definição não idêntica | — |
| Envases pendentes | `ordens_servico_onfarm` | `status='envase'` | Agora | `/envase` ⚠️ definição não idêntica | — |
| Insumos críticos | `produtos`+`estoque_produto` | disponível < `estoque_minimo` | Agora | `/estoque` ⚠️ sem filtro | 0 (não há `e_insumo=true`) |
| Entregas pendentes | `entregas` | `status ∈ (separado, em_rota)` | Agora | `/entregas` ⚠️ sem filtro | `count = 4` |

---

## 4. Estado do dataset de staging (fato bloqueante para certificação)

Contagens reais no momento da auditoria: `alertas_operacionais` **0 linhas**, `receivable_payments` **0**, `produtos` com `e_insumo=true` **0**, `ordens_servico_onfarm` com `status='aberta'` **0**, `clientes` ativos **2**, `lotes` em produção **1**, `entregas` pendentes **4**.

Consequência: a maioria dos KPIs retorna zero **legítimo**, e portanto o commit auditado **não poderia ter comprovado** correção de fórmula por observação de valores. Reconciliação real exige o dataset sintético `TESTE_VISAO_GERAL_E2E_<run_id>` — **não executado neste ciclo** (ver §6).

---

## 5. Perfis e isolamento

Provado por evidência estática/SQL:
- `anon` **não** possui EXECUTE em nenhuma das duas RPCs (`has_function_privilege = false`) → chamada anônima falha em nível de privilégio, antes de qualquer lógica.
- Ambas as RPCs abortam com `42501` se `auth.uid() IS NULL` ou se `is_executivo(uid)` for falso; `is_executivo` valida `administrador`/`gestor` via `user_roles` (tabela separada, sem papel em `profiles`).
- Rotas `/dashboard/*` restritas a administrador/gestor em `src/lib/permissions.ts`; a `VisaoGeral` não dispara nenhuma consulta adicional além das duas RPCs (verificado por leitura completa do componente — não há fetch oculto por card).

**Não provado por execução runtime**: sessões reais para os 11 perfis exigidos, chamadas diretas das RPCs com IDs de outro escopo e tentativa de acesso cruzado parceiro A × parceiro B. O executor SQL disponível nesta sessão roda com papel restrito (não consegue `SET ROLE authenticated` nem executar as RPCs/views: `permission denied for function rpc_executivo_resumo_geral` / `has_role`), e não há credenciais de sessão de usuário disponíveis. Registrado como lacuna L-01.

---

## 6. Matriz A–T — expected × obtained

| Cenário | Situação | Observação |
|---|---|---|
| A Reconciliação de cada KPI | ⚠️ PARCIAL | reconciliado por SQL direto onde há dados (clientes, lotes, entregas, OS); demais = 0 por dataset vazio |
| B Períodos e timezone | ⚠️ PARCIAL | lógica corrigida e revisada (D-02); sem execução runtime |
| C Ativos/cancelados/rascunhos/duplicados/órfãos | ❌ NÃO EXECUTADO | depende de dataset sintético |
| D Deep links | ⚠️ PARCIAL | rotas existem; params corrigidos em `/ordens-servico`; `/lotes`, `/agenda-tecnica`, `/estoque`, `/entregas` sem filtro equivalente |
| E Filtros combinados | ❌ NÃO APLICÁVEL/EXECUTADO | `VisaoGeral` não expõe filtros (período fixo 30 dias) |
| F Refresh / back-forward | ❌ NÃO EXECUTADO | — |
| G–J Perfis e isolamento | ⚠️ PARCIAL | ACL e gates provados por SQL; sessões reais não executadas (L-01) |
| K Dataset vazio | ✅ | é o estado atual do staging: cards renderizam 0/"—" sem erro |
| L Erro/retry | ✅ (código) | card consolidado com "Tentar novamente" + estado "Indisponível" por indicador (D-03) |
| M Concorrência | ❌ NÃO EXECUTADO | — |
| N Mobile/desktop | ⚠️ PARCIAL | grid responsivo `1/2/4` e `2/3/6` revisado por código; sem captura em viewport real |
| O Acessibilidade | ⚠️ PARCIAL | nenhum dado crítico só em hover; falta rótulo textual em ícones decorativos |
| P Performance | ❌ NÃO MEDIDO | `EXPLAIN ANALYZE` indisponível: o executor não tem privilégio sobre as views/funções envolvidas |
| Q Card × drill-down | ⚠️ PARCIAL | divergência conhecida em `/lotes`, `/controle-qualidade`, `/envase`, `/estoque`, `/entregas`, `/agenda-tecnica` |
| R Financeiro | ✅ (estático) | paridade de fórmula com a RPC financeira canônica comprovada por leitura do `prosrc` |
| S Produção/estoque | ⚠️ PARCIAL | fórmulas validadas contra CHECK/enums reais; sem dados |
| T Comercial/B2B | ❌ NÃO EXECUTADO | — |

**Harness `TESTE_VISAO_GERAL_E2E_<run_id>`: não criado.** Nenhuma fixture, usuário efêmero ou Edge Function temporária foi criada neste ciclo — portanto **não há resíduo a limpar** (cleanup trivialmente verificado: nenhuma tabela/registro com o prefixo existe).

---

## 7. Qualidade

| Gate | Resultado |
|---|---|
| Typecheck (`tsgo -p tsconfig.app.json`) | ✅ 0 erros |
| Suíte completa (`vitest run`) | ✅ 163 arquivos, 2706 testes PASS, 4 skip, exit 0 |
| Build (`npm run build`) | ✅ exit 0 |
| Migration aplicada | ✅ staging `ikaauvsflpmamgxmkhoq` |
| Segredos/DSN/PII no diff | ✅ nenhum; UUIDs reais não foram registrados neste relatório |

Linter Supabase: 417 achados **pré-existentes** no projeto (RLS sem policy, security definer views, search_path mutável) — nenhum introduzido por esta migration; fora do escopo deste gate.

---

## 8. Riscos abertos

| ID | Sev. | Risco |
|---|---|---|
| R-01 | ALTO (condicional) | Ausência de escopo organizacional nas tabelas de KPI: a introdução de uma segunda organização transforma todas as contagens em leitura consolidada cruzada. |
| R-02 | MÉDIO | Divergência card × drill-down em 6 destinos que não aceitam o recorte do card. |
| R-03 | MÉDIO | `VisaoGeral` não possui filtros (período fixo); o pedido original previa período/cliente/fazenda. |
| R-04 | MÉDIO | Sem prova runtime por perfil (L-01) e sem medição de performance. |
| R-05 | BAIXO | `insumos_criticos` assume litros em ambos os lados sem coluna de unidade. |
| R-06 | BAIXO | Janela 21h–00h BRT pode divergir entre `receita_recebida` (BRT) e a RPC financeira (UTC). |

---

## 9. Custo real

Auditoria estática completa do agrupamento, 8 consultas SQL de inventário/ACL/reconciliação, 1 migration corretiva, 3 arquivos de frontend alterados, suíte completa + build. Sem harness runtime, sem Edge Function temporária, sem dados sintéticos.

---

**VEREDITO FINAL: `APTO COM RESSALVAS`.**
As correções estruturais (D-01 a D-04) estão aplicadas e validadas por typecheck, suíte completa e build. **Não é possível declarar `STAGING CERTIFICADO`**: faltam o harness A–T com dados sintéticos, as sessões reais por perfil, a medição de performance e a paridade card × drill-down em 6 destinos. Nada foi promovido ou publicado; produção permanece intocada.
