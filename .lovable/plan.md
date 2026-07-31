# Auditoria somente leitura — Módulo Protocolos (staging ikaauvsflpmamgxmkhoq)

Nenhuma alteração foi feita em código, banco, RLS, migrations ou configuração. Produção `navfzbwgwzruipouyfnk` não foi acessada.

## 1. Causa raiz do quadro "Objetivo da visita" na aba Cultura

Não há colisão de componentes, rota, query key ou tabela. O comportamento é **acoplamento deliberado no código**, hoje indesejado:

- `src/pages/Protocolos.tsx:266-292` — o diálogo "Nova Cultura" é um `Tabs` com duas abas: `Dados` e **`Objetivos de Visita`**.
- `src/pages/Protocolos.tsx:250-255` — ao salvar uma cultura nova, o código faz `setEditingItem(data)`, `setActiveTab("objetivos")` e exibe o toast "Cultura cadastrada! Agora você pode adicionar objetivos de visita." Ou seja, o salto para o quadro de visitas é automático e intencional.
- `src/pages/Protocolos.tsx:36-205` (`ObjetivosCulturaPanel`) lê e grava diretamente em `public.objetivos_visita_sugestoes` filtrando por `cultura_id`.
- O mesmo cadastro já existe, de forma correta, em `src/pages/configuracoes/ObjetivosVisita.tsx` (Configurações), descrito como "sugestões exibidas no campo 'Objetivo da visita' do formulário de Visita Técnica" (`src/pages/Configuracoes.tsx:564`).
- Consumo real: `src/hooks/useObjetivosVisita.ts` (combina genéricas + da cultura) alimentando `src/pages/VisitaTecnica.tsx:1409` e `src/pages/app/MobileVisitaWizard.tsx:851`.

Confirmações de banco (staging, read-only):
- `objetivos_visita_sugestoes.cultura_id` é FK real para `culturas` (`objetivos_visita_sugestoes_cultura_id_fkey`) — é sugestão por cultura, não campo de cultura.
- Cadastrar cultura **não** cria registro de visita: nenhuma escrita em `visitas_campo` / `registros_consultor` ocorre nesse fluxo.
- Estado atual: `culturas = 1`, `objetivos_visita_sugestoes = 0`.

**Severidade: média (UX/modelagem), não crítica.** Nada é exigido nem persistido indevidamente: o campo é opcional e grava em tabela própria. O defeito é de domínio/navegação — cadastro mestre de cultura misturado com parametrização de visita técnica, com salto automático que sugere ao usuário estar em um fluxo de visita.

## 2. Estado real do módulo "Protocolos"

- Rota `/protocolos` (`src/App.tsx:480`), menu em `src/config/navigation.ts:108`, desktop-only.
- Abas: Produtos, Microrganismos, Catálogo Técnico, Culturas, Problemas (`src/pages/Protocolos.tsx`, MAIN_TABS).
- **Não existe entidade "protocolo"**: verificado no banco — `public.protocolos` e `public.protocolo_itens` não existem (0 tabelas). O módulo é, de fato, administração de catálogo técnico e cadastros mestres. Logo, os itens do pedido sobre "publicação de protocolo", "protocolo → cultura → catálogo → carrinho" e "snapshot de protocolo" **não têm objeto no sistema atual**; o versionamento existente é de ficha técnica (`ficha_tecnica_versoes`, `product/microorganism_technical_profiles` com `status_validacao`).
- Cultura é cadastro mestre reutilizável e referenciado por FK em 8 tabelas: `talhoes`, `talhao_safras`, `visitas_campo`, `registros_consultor`, `ordens_servico_onfarm`, `product_crop_recommendations`, `microorganism_crop_recommendations`, `objetivos_visita_sugestoes`. Sem duplicidade hoje (0 nomes repetidos), porém **sem índice único em `culturas.nome`** — o único índice é a PK.

## 3. RLS e permissões (verificado em `pg_policies`)

- `culturas`: leitura para qualquer autenticado; escrita apenas `administrador`/`gestor`.
- `objetivos_visita_sugestoes`: leitura para qualquer autenticado; insert/update/delete apenas `administrador`/`gestor`. A UI espelha isso (`canManageObjetivos`, `Protocolos.tsx:210`).
- `product_crop_recommendations` / `microorganism_crop_recommendations`: escrita via `can_manage_catalog_tecnico`; leitura interna via `can_view_catalog_internal`, e para produtor/parceiro apenas itens ativos com ficha aprovada (parceiro exige `b2b_enabled`). Coerente.
- `catalogo_alvos`: leitura para todo autenticado; escrita para admin/gestor/técnicos.

Nenhum acesso cruzado indevido identificado nas tabelas do módulo. Ressalva: `culturas` e `objetivos_visita_sugestoes` são legíveis por parceiro B2B e produtor (dado não sensível, mas é exposição ampla).

## 4. Catálogo, simulador, condições e preços

- Catálogo unificado (`src/hooks/useCatalogoUnificado.ts`, `CatalogoCardsGrid`) não consome cultura nem objetivos; as mudanças recentes de Catálogo/Simulador **não** interagem com a aba Cultura.
- `commercial_price_rules` está vazia em staging (0 linhas) — a resolução de preço não é afetada por cultura/recomendação por cultura em nenhum caminho de código. Não há risco de as culturas alterarem resolução de preço.
- Portanto, itens 7–9 do escopo: sem regressão atribuível a cultura/protocolo; o gap real continua sendo a ausência de regras de preço povoadas (já reportado na Fase E).

## 5. Outros achados

- `ObjetivosCulturaPanel` faz fetch manual com `useState/useEffect` e ainda invalida query keys React Query (`Protocolos.tsx:46-49`) — inconsistência de padrão, sem impacto funcional.
- `CulturasTab` usa `fetch()` manual sem estados de loading/erro (`Protocolos.tsx:217-221`); lista vazia e erro se confundem.
- Duplicação de superfície: o mesmo CRUD de objetivos existe em Configurações → Objetivos de Visita e dentro do diálogo de Cultura.
- `src/components/protocolos/catalog/CropsManager.tsx` usa o rótulo "Objetivo de uso" (campo `objetivo_uso` de recomendação por cultura do produto) — correto e distinto de "objetivo da visita"; pode confundir por nomenclatura próxima.
- Testes: não há teste unitário, de integração ou E2E cobrindo a aba Culturas, `objetivos_visita_sugestoes` ou o diálogo Nova Cultura. Cobertura existente é de catálogo/simulador/portais.

## 6. Classificação

**APTO COM RESSALVAS.** Sem defeito de integridade, sem escrita indevida, sem falha de RLS. Ressalvas: acoplamento de domínio na UI de cultura, ausência de índice único em `culturas.nome`, duplicação de CRUD e lacuna de testes.

## 7. Correções recomendadas (nenhuma aplicada — exigem aprovação)

Obrigatórias
1. Remover a aba "Objetivos de Visita" do diálogo de Cultura e o salto automático pós-salvamento (`Protocolos.tsx:250-255, 266-292`), mantendo o CRUD apenas em Configurações → Objetivos de Visita. Impacto: só UI; rollback = reverter o arquivo.
2. Ajustar o toast de sucesso para não citar visita.

Melhorias opcionais
3. Índice único case-insensitive em `culturas.nome` (migration; risco baixo, exige checagem prévia de duplicatas).
4. Converter `CulturasTab`/objetivos para React Query com loading/erro/vazio padronizados.
5. Renomear "Objetivo de uso" em `CropsManager` para "Objetivo agronômico" e reduzir ambiguidade.
6. Testes: unitário do diálogo Cultura (garantindo ausência de campos de visita), teste de RLS de `objetivos_visita_sugestoes` por perfil, e E2E cultura → recomendação por cultura → catálogo.
7. Decidir formalmente se "protocolo" deve existir como entidade versionada; hoje o menu promete algo que o schema não tem.

## 8. Fases propostas

- Fase P1 (UI, sem banco): itens 1–2.
- Fase P2 (qualidade): itens 4–5.
- Fase P3 (banco): item 3, com precheck de duplicatas e rollback por `DROP INDEX`.
- Fase P4 (testes): item 6.
- Fase P5 (produto): item 7, apenas após decisão de negócio.
