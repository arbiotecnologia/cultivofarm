# Relatórios Executivos — AR Bio

Documentação operacional da camada de **Relatórios Executivos** (Fase 13.5) do Portal Executivo AR Bio.

## Acesso

* Apenas perfis `administrador` e `gestor` (validado por `public.is_executivo(auth.uid())`).
* Toda RPC realiza validação interna; o frontend não é a única barreira.
* Não há acesso para `cliente_produtor`, `consultor_tecnico`, `tecnico_agronomo`, `producao`, `operador_onfarm`, `aplicador`. O perfil `financeiro` só acessa se também for `administrador` ou `gestor`.

## Tipos de relatório

| Tipo | Finalidade | Período padrão |
|---|---|---|
| `resumo_geral` | Visão consolidada para reuniões rápidas | 30 dias |
| `operacional` | OS, produção, CQ, envase, estoque, entregas, gargalos operacionais | 30 dias |
| `financeiro` | Receber, recebido, vencidos, pagar, entregas não faturadas, fiscal, ranking | 30 dias |
| `clientes_fazendas` | Carteira, rankings, clientes em risco, oportunidades | 30 dias |
| `alertas_acoes` | Alertas, SLA, prioridades, plano, pendências por responsável | 30 dias |
| `completo` | Todas as seções | 30 dias |
| `diretoria` | Visão resumida e estratégica | 30 dias |
| `reuniao_semanal` | Curto prazo (vencimentos, ações da semana) | 7 dias |
| `reuniao_mensal` | Desempenho e plano de ação | 30 dias |

## Fontes de dados

As RPCs consolidadoras reaproveitam as seguintes funções existentes:

* `rpc_executivo_resumo_geral`
* `rpc_executivo_gargalos`
* `rpc_executivo_timeline_operacional`
* `rpc_executivo_financeiro_resumo`
* `rpc_executivo_financeiro_gargalos`
* `rpc_executivo_financeiro_ranking_clientes`
* `rpc_executivo_clientes_resumo`
* `rpc_executivo_clientes_ranking`
* `rpc_executivo_alertas_resumo`
* `rpc_executivo_alertas_prioridades`
* `rpc_executivo_plano_acao`
* `rpc_executivo_responsaveis_pendencias`

## Limites aplicados

* gargalos: 20
* plano de ação: 20
* rankings: 10 (clientes/fazendas)
* alertas críticos: 20
* timeline: 30

## Persistência e auditoria

* Cada geração cria registro em `public.executivo_relatorios` (com hash de conteúdo `md5`) e evento `gerado` em `public.executivo_relatorio_eventos`.
* Visualização → evento `visualizado`.
* Exportação PDF/CSV → eventos `exportado_pdf` / `exportado_csv` via `rpc_executivo_exportar_relatorio_evento`.
* Arquivamento → `status = arquivado`, `ativo = false`, evento `arquivado`.
* **Não há DELETE físico.** Nenhuma policy de DELETE; nenhum endpoint expõe deleção.

## Exportação PDF / impressão

* Implementada via `window.print()` + CSS `@media print` em `src/index.css`.
* Layout limpo em A4: oculta filtros/menus/botões; mantém somente `#executivo-relatorio-print`.
* Inclui: cabeçalho AR Bio, título, período, data de geração, responsável (via RPC), indicadores, gargalos, plano de ação, alertas críticos, rankings (quando aplicável), rodapé identificador e hash.

## Exportação CSV (`src/lib/executivoCsv.ts`)

Tabelas permitidas: `gargalos`, `ranking_clientes`, `ranking_fazendas`, `plano_acao`, `alertas`.

Proteções obrigatórias aplicadas a **todas** as células:

1. Prefixar com apóstrofo qualquer célula iniciada por `=`, `+`, `-`, `@`, `\t` ou `\r`.
2. Escapar aspas duplas dobrando-as.
3. Encapsular tudo em aspas duplas.
4. Prepend BOM UTF-8 (`\uFEFF`) para compatibilidade Excel.

**Nunca exportar:** JSON bruto, metadata, anexos, comprovantes, XML/DANFE, documentos fiscais completos, assinaturas, telefones/e-mails.

## Boas práticas para reuniões

* Use **Reunião Semanal** para acompanhar pendências críticas, vencimentos e ações da semana.
* Use **Reunião Mensal** para revisar desempenho, riscos e plano de ação consolidado.
* Use **Diretoria** para apresentação executiva com visão estratégica e financeira resumida.
* Use **Completo** apenas quando precisar de visão integral; tende a ser mais denso.
* Arquive relatórios antigos em vez de regerar repetidamente — isso preserva o histórico.

## Limitações conhecidas

* Geração é síncrona e depende das RPCs subjacentes. Falhas individuais são capturadas e registradas como `*_erro` no JSON, sem abortar o relatório.
* CSV não inclui campos aninhados (objetos/arrays) — apenas valores primitivos.
* PDF usa o diálogo de impressão do navegador; estilo final depende das configurações do usuário.

## Fase 13.5.1 — Correções

* RPCs internas devolvem objetos (`{ gargalos: [...] }`, `{ ranking: [...] }`, `{ prioridades: [...] }`, `{ acoes: [...] }`, `{ ranking_clientes/ranking_fazendas: [...] }`). A `rpc_executivo_gerar_relatorio` extrai apenas o array interno via `public.jsonb_get_array_safe(payload, chave)` e grava em `executivo_relatorios` como array JSONB válido.
* Período personalizado: quando `filtros.data_inicio` e `filtros.data_fim` existem (ou `periodo='personalizado'`), têm prioridade sobre `periodo`. Sem datas válidas, fallback de 30 dias com observação interna em `metadata.obs_internas` (não exposta no detalhe).
* Períodos aceitos: `hoje`, `7_dias`, `15_dias`, `30_dias`, `90_dias`, `180_dias`, `365_dias`, `safra_atual`, `personalizado`.
* `rpc_executivo_obter_relatorio` agora retorna **jsonb seguro** (sem `metadata`). O drawer aplica `Array.isArray` + fallback para chaves legadas (`gargalos`, `acoes`, `ranking`, `ranking_clientes`, `ranking_fazendas`, `prioridades`) garantindo compatibilidade com relatórios anteriores à correção.
* Listagem (`rpc_executivo_listar_relatorios`) continua resolvendo nome via `profiles.user_id = executivo_relatorios.gerado_por` usando `profiles.nome` (nunca `nome_completo`).

## Fase 13.5.2 — Evento de geração

* `executivo_relatorio_eventos` possui colunas: `id`, `relatorio_id`, `evento`, `descricao`, `user_id`, `metadata`, `created_at`. **Não existe coluna `detalhes`**.
* Evento de geração agora é registrado como:
  * `evento = 'gerado'`
  * `descricao = 'Relatório gerado'`
  * `metadata = { "tipo": <p_tipo> }`
* Demais eventos (`visualizado`, `exportado_pdf`, `exportado_csv`, `arquivado`, `cancelado`, `erro_exportacao`) continuam usando `descricao` (texto legível) e `metadata` (detalhes técnicos seguros, sem expor anexos, XML, DANFE, comprovantes ou dados pessoais).
