# Evolução do módulo "Protocolos" → "Base Técnica Agronômica" (somente staging)

Ambiente: staging `ikaauvsflpmamgxmkhoq`. Produção `navfzbwgwzruipouyfnk` não é acessada, nada é publicado nem promovido. Nenhuma entidade nova de protocolo é criada nesta fase.

## Inventário confirmado (leituras já realizadas)

- Rota: `/protocolos` em `src/App.tsx` (linha 480), protegida por `RoleGuard`.
- Menu: item `protocolos` em `src/config/navigation.ts` (label "Protocolos", seção "Comercial e Relacionamento", `searchKeywords` com protocolo/manejo/recomendação).
- Página: `src/pages/Protocolos.tsx` — H1 "Protocolos Técnicos", subtítulo "Cadastro de produtos, culturas, problemas e microrganismos", 5 abas (Produtos, Microrganismos, Catálogo Técnico, Culturas, Problemas).
- Permissões: chave `/protocolos` em `src/lib/permissions.ts`.
- Testes que citam a rota/id: `src/test/navigation.fase4.test.ts`, `src/test/navigation/useTabParam.test.tsx`, `src/test/protocolos/*`, `e2e/protocolos-culturas.spec.ts`.
- Não existe componente de breadcrumb global usando o nome do módulo (só `src/components/ui/breadcrumb.tsx`, genérico) — o título da página é a única referência textual visível.
- Diálogo de Cultura já contém apenas Nome e Descrição (correção P1 aplicada); `useCulturas` já cobre loading/vazio/erro/sucesso, índice único case-insensitive `culturas_nome_ci_uidx`, colunas `ativo/desativada_em/desativada_por` e trigger que bloqueia exclusão de cultura em uso.

## Escopo desta execução

### 1. Renomeação apenas de interface
- Menu: label "Protocolos" → "Base Técnica"; `searchKeywords` passa a incluir `base técnica`, `base tecnica`, `produtos`, `culturas`, `alvos`, `recomendações` e mantém `protocolo`/`protocolos` como compatibilidade de busca.
- Página: H1 "Base Técnica Agronômica"; descrição "Produtos, microrganismos, culturas, alvos e recomendações técnicas."; `document.title` correspondente.
- Preservados: rota `/protocolos`, id `protocolos` do menu, chave de permissão, componentes, pastas `src/components/protocolos/**`, hooks, tabelas, RLS, dados e imports. Sem renomeação em massa.
- `/base-tecnica` não é criada; fica documentada como evolução futura com redirect compatível.

### 2. Auditoria da correção P1 (Cultura x Objetivos de Visita)
- Revisar o diff atual e confirmar por inspeção e runtime: diálogo de Cultura sem aba/campos de objetivo, sem salto automático e sem toast direcionando para visitas.
- Confirmar que objetivos seguem funcionando em Configurações → Objetivos de Visita, Visita Técnica e wizard mobile, com sugestões genéricas e por cultura, sem alteração em `objetivos_visita_sugestoes`.

### 3. Cadastro de Culturas
- Manter o hook existente `useCulturas` (não criar fluxo paralelo) e completar o que faltar: mensagem específica de permissão negada, prevenção de duplo clique nos botões de salvar/desativar, revisão de responsividade mobile/desktop.

### 4. Integridade e desativação
- Precheck read-only em staging (duplicidades exatas e normalizadas, espaços, referências, FKs, comportamento de exclusão) antes de qualquer DDL. Se surgir duplicidade, a execução para e o conflito é reportado, sem correção automática.
- Índice único funcional e triggers de bloqueio já existem; migration nova só se o precheck mostrar lacuna (por exemplo motivo de desativação), e nesse caso será idempotente, forward-safe, com rollback documentado.

### 5. Rótulo "Objetivo agronômico"
- Já aplicado em `CropsManager.tsx`; a execução revisa placeholder, ajuda contextual e acessibilidade (`aria-label`), mantendo a coluna `objetivo_uso`.
- Documentar a separação: objetivo agronômico pertence à recomendação; objetivo da visita pertence ao registro de visita; nenhum pertence ao cadastro mestre de cultura.

### 6. Auditoria de fluxo e RLS (read-only)
- Rastrear Base Técnica → recomendação por cultura → Catálogo → Simulador → Condições e Preços → Carrinho → Pedido/snapshots, validando inativos ocultos, exigência de ficha aprovada, habilitação B2B, preço resolvido apenas no servidor, assignments publicados, quantidade mínima no backend, coerência de `fixed_item_price`/`discount_from_base`/`quote_only` e imutabilidade de pedidos históricos.
- Harness SQL transacional (ROLLBACK, fixtures sintéticas, sem service role como identidade) para os 8 perfis sobre `culturas`, `objetivos_visita_sugestoes`, `catalogo_alvos`, `product_crop_recommendations`, `microorganism_crop_recommendations` e perfis/versões técnicas. Nenhuma policy é afrouxada.

### 7. Testes
- Atualizar/criar: menu mostra "Base Técnica"; página mostra "Base Técnica Agronômica"; `/protocolos` continua respondendo; busca do menu encontra Base Técnica, Produtos, Culturas e ainda "Protocolos"; cultura sem objetivo de visita; criar/editar cultura; duplicidade normalizada bloqueada; cultura em uso não exclui; objetivos disponíveis em Configurações/Visita; objetivo agronômico na recomendação; RLS por perfil; inativo/não aprovado invisível externamente; cadeia cultura → recomendação → catálogo → simulador; paridade de unidade/dose/volume; regressão de Condições e Preços; estados de UI; desktop e mobile.
- Validações finais: typecheck, testes direcionados, suíte completa e build. Evidências desktop e mobile via Playwright.

### 8. Proposta separada (sem implementação)
- `docs/proposta-entidade-protocolo-agronomico.md` com objetivo, cabeçalho, versões, culturas, alvos, itens (produtos/microrganismos, dose, unidade, volume, sequência, intervalo, estágio), vigência, aprovação, snapshot, uso em simulador/visita/pedido/produção, impactos, riscos, fases e complexidade — exigindo nova aprovação humana.

## Entrega final
Relatório em `docs/base-tecnica-renomeacao-relatorio.md` com ambiente validado, commit, arquivos alterados, migration (se houver), nome anterior/novo, rotas preservadas, resultado da correção de Cultura, integridade, RLS/grants, testes, regressões, evidências, rollback, pendências, riscos residuais, confirmação de não acesso à produção e classificação final (APTO / APTO COM RESSALVAS / BLOQUEADO / NÃO APTO).
