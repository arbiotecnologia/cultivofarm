# Envase — auditoria e correção consolidada (13/09/2026)

Alvo único: Supabase CultivoFarm **swzpzcwiasxmjutrmvkm**. Nesta rodada **não houve execução de banco**,
nenhuma publicação, nenhuma sincronização GitHub e nenhum dado criado.

## Arquivos alterados
- `src/lib/envase/consulta.ts` (novo contrato puro)
- `src/lib/envaseFormat.ts` (`defaultValidade` local, `addMesesLocal`, `toISODateLocal`)
- `src/pages/EnvasePage.tsx` (reescrita da consulta e do complemento)
- `src/components/cockpit/RegistrarEnvaseDialog.tsx` (remoção da edição de produção)
- `src/hooks/useEsteiraLaboratorio.ts` (propagação da chave de idempotência no complemento)
- `src/test/envase/consulta.test.ts` (novo)
- `restoration/envase/sql/20260913060000_envase_hardening.sql`, `restoration/envase/sql/90-rollback.sql`

## Correções
1. **Estados reais** — carregamento, erro com "Tentar novamente" e vazio filtrado. Falha nunca mais é
   exibida como "Nenhum envase registrado".
2. **Sem truncamento nem teto silencioso** — removidas a janela de 90 dias e TODAS as chamadas a
   `.limit()` (lotes por busca, lotes elegíveis e produtos). As consultas auxiliares usam o helper
   testável `carregarTudo`, que percorre páginas técnicas de 1.000 até esgotar e ERRA explicitamente se
   atingir o teto defensivo — nunca omite registro em silêncio. A paginação server-side de 50 por página
   com `count: "exact"` vale apenas para a tabela principal; busca, produto e período filtram no banco.
   Realtime mantém debounce de 1,2 s e qualquer mudança de filtro volta à página 1.
3. **Período e falhas auxiliares** — data inicial posterior à final bloqueia a consulta com mensagem
   `role="alert"`, sem empty-state nem paginação enganosa. Busca, produto e datas têm rótulos associados.
   Falha ao carregar lotes com saldo ou produtos aparece como erro com "Tentar novamente", nunca como
   ausência de opções. A busca do usuário é debounced em 400 ms — sem consulta por tecla.
4. **Elegibilidade determinística** — o complemento só aparece com lote `aprovado` **e** último CQ
   aprovado, na MESMA ordem canônica do banco/RPC: `created_at DESC, seq DESC`. A coluna
   `controle_qualidade.seq` EXISTE em produção, é lida no select e é o desempate primário;
   `data_analise DESC` e `id DESC` ficam apenas como fallback defensivo para linhas sem `seq`.
   CQ aprovado antigo seguido de reprovação não libera nada. O banco continua sendo a autoridade.
5. **Complemento seguro** — chave de idempotência estável por abertura/tentativa (não é regerada em retry
   da mesma tentativa), trava de duplo envio, quantidade inteira positiva e validade estritamente futura.
6. **Produção intocável na tela** — `RegistrarEnvaseDialog` não altera mais `lotes.volume_produzido`;
   sem produção registrada o envase é bloqueado com orientação de voltar à etapa de produção do Cockpit.
7. **Validade padrão** — calendário local, sem deslocamento UTC e com limitação ao último dia do mês
   (31/08 + 6 meses = 28/02).
8. **Etiquetas e embalagens pós-envase** — fluxos preservados sem alteração.

## Pós-check real informado (produção CultivoFarm)
- `database=postgres`; `public.envase` vazio, RLS ativa.
- `anon` sem QUALQUER grant; `authenticated` somente `SELECT`.
- Gatilho legado `trg_envase_avanca_os` ausente.
- `quantidade` e `volume_por_unidade` com `NOT NULL`.
- 3 constraints válidas, com estes nomes exatos: `envase_quantidade_positiva`, `envase_volume_valido`
  (positivo e finito) e `envase_embalagem_volume_coerente` (1L=1000, 5L=5000, 20L=20000).
- RLS de `public.envase` ativa.
O pós-check do script comprova exatamente esses seis pontos mais a RLS e o `EXECUTE` da RPC para
`authenticated`. O rollback (`sql/90-rollback.sql`) restaura o estado anterior por completo — inclusive a
recriação de `trg_envase_avanca_os` com `public.fn_envase_avanca_os()` e os grants de escrita — e por isso
**REABRE O RISCO**: serve apenas para incidente, com nova homologação em seguida.
- `rpc_cockpit_registrar_envase_v1` SECURITY DEFINER, executável apenas por `authenticated`, com guarda de
  papel, locks, validações de validade/CQ/volume e idempotência.

## Dívidas preservadas
- **Atomicidade CQ + avanço de etapa** permanece em aberto (registro e avanço não são uma única transação).
- **Quarentena/reanálise** ainda precisa ser desenhada antes de homologar cenários de reprovação.
- Sem dados em `public.envase`, não há E2E nem teste de concorrência: cenários reais seguem não homologados.
- Filtro de busca por código de lote resolve até 200 lotes por consulta antes de filtrar envases; bases
  muito grandes podem exigir um índice/RPC dedicado.
- RLS de `public.envase` não foi reavaliada nesta rodada; a contagem exibida reflete apenas linhas acessíveis.
