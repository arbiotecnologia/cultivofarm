# Lotes — auditoria local 13/09/2026

## Escopo
Somente frontend/código local. Nenhum banco, Auth, Storage, RPC, secrets ou dados acessados; nenhuma publicação/sincronização. Valores de testes somente em memória. Constraints OS aplicadas e convalidated=true segundo usuário; migração preservada, não reaplicada.

## Arquivos alterados
- src/pages/Lotes.tsx
- src/lib/lotes/consulta.ts
- src/test/lotes/consulta.test.ts
- restoration/lotes/README.md
- restoration/ordens-servico/README.md (status declaratório)
- roadmap.md

## Correções
- Removida escrita de status/envio CQ desta página; avanço somente via Cockpit existente. Sem mudanças de rotas/permissões.
- Loading/erro/retry/vazio/resultados filtrados separados. Falha de qualquer consulta bloqueia conjunto parcial.
- Leitura em páginas estáveis, sem corte fixo 200/90 dias; envases por lote sem restrição cronológica. Deduplicação dos lotes; paginação visual 20, contadores, busca rotulada, filtros status/produto/microrganismo/OS/período e limpeza.
- AbortController, timeout 30s, versionamento e cancelamento na desmontagem. Atualização manual bloqueada durante carga; realtime de lote/envase/programação.
- Datas civis preservadas, timestamps America/Sao_Paulo. Campo de validade não existe no contrato de lotes: não inventado.
- Zero preservado; nulos/negativos/não-finitos exibidos como desconhecidos. Embalagens exigem quantidades inteiras positivas; envase incompleto invalida total. Excesso não aparece como completo. Saldo é de envase, não estoque disponível.
- Vínculo OS manual/onfarm via programação; ambiguidade bloqueia link contextual. Parâmetro os já existente no Cockpit codificado. Ausência/inacessibilidade explicitada.
- Controles nomeados, região de tabela rolável com foco por teclado, estados status/alert, paginação acessível. Sem homologação visual autenticada.

## Limites e riscos restantes
1. **Rastreabilidade completa não entregue inline**: planejamento/pedido, cliente/parceiro, CQ detalhado, validade por embalagem e eventos estoque/entrega continuam exigindo consulta contextual e etapa própria. Badge B2B antigo só cobria OS manual e foi removido para não representar cadeia parcial como completa.
2. RLS pode ocultar envases e subestimar totais; navegador não distingue ausência de inacessibilidade. Policies permissivas iniciais no histórico não comprovam estado atual de produção. Não certificar segurança real sem inspeção autorizada.
3. Paginação não é snapshot transacional; alterações concorrentes podem deslocar páginas. Totais refletem registros acessíveis. Grandes históricos podem atingir timeout. Agregação e paginação servidor precisam de etapa autorizada.
4. Geração de códigos, unicidade, papéis, transições e auditoria atômica continuam responsabilidade do servidor/Cockpit. Remoção de escrita nesta tela não impede chamadas externas. Não alterado GerarLoteDialog.
5. Nenhum SQL de alteração preparado: contratos de multilote, nulos históricos e policies reais não estão suficientemente estabelecidos para impor nova constraint/policy segura. Não inventar regras restritivas nem substituir policies por permissivas.

## Diagnóstico futuro proposto — NÃO EXECUTADO
Pré-condições: autorização específica, comprovação externa do destino canônico swzpzcwiasxmjutrmvkm, revisão de contratos; não usar canal gerenciado divergente.
```sql
BEGIN TRANSACTION READ ONLY;
SELECT id, codigo_lote, programacao_id, volume_produzido FROM public.lotes
WHERE volume_produzido < 0 OR volume_produzido::text IN ('NaN','Infinity','-Infinity');
SELECT codigo_lote, count(*) FROM public.lotes GROUP BY codigo_lote HAVING count(*) > 1;
SELECT programacao_id, count(*) FROM public.lotes WHERE programacao_id IS NOT NULL
GROUP BY programacao_id HAVING count(*) > 1;
SELECT id, lote_id, quantidade, volume_por_unidade FROM public.envase
WHERE quantidade <= 0 OR quantidade <> trunc(quantidade) OR volume_por_unidade <= 0
OR quantidade IS NULL OR volume_por_unidade IS NULL
OR quantidade::text IN ('NaN','Infinity','-Infinity')
OR volume_por_unidade::text IN ('NaN','Infinity','-Infinity');
SELECT id FROM public.programacao_producao
WHERE ordem_servico_id IS NOT NULL AND ordem_servico_onfarm_id IS NOT NULL;
SELECT tablename, policyname, cmd, qual, with_check FROM pg_policies
WHERE schemaname='public' AND tablename IN ('lotes','envase','programacao_producao');
ROLLBACK;
```
Múltiplos lotes por programação não são necessariamente duplicidade indevida. Não corrigir dados automaticamente. Ordem futura: diagnóstico → validar contrato/estado real → preparar SQL separado autorizado → aplicar com autorização → verificar definições/comportamento. Nenhuma alteração SQL nesta etapa, portanto nenhum rollback SQL necessário. Rollback frontend restrito às mudanças desta etapa; não restaurar escrita direta de status sem auditoria.

## Evidências
- 20 testes novos; lote focado com OS/Cockpit/runtime: **55/55**.
- Ampliados: **134/135**; única falha no gate do `.env` gerenciado divergente conhecido, separado do runtime canônico aprovado. Teste não enfraquecido.
- Gate runtime aprovado: único createClient em client.ts, URL literal https://swzpzcwiasxmjutrmvkm.supabase.co, assert antes da criação, zero refs divergentes, zero imports gerenciados/variáveis dinâmicas na produção.
- cultivofarm.types.ts intacto: **21.850 linhas**, SHA-256 f270cfbd1c4b42fbff928b4ad6bff351b4c37fbc135d880c8bb104ca2ac8cd41.
- Build automático OK em 2026-09-13T03:07:26Z. Typecheck/build manuais proibidos neste ambiente; sem comprovação separada de typecheck.
- Sem E2E conectado, concorrência real ou homologação completa de rastreabilidade: serviços proibidos nesta etapa.
