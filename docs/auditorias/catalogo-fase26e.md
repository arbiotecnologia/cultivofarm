# FASE 26E — Volumes/Preços e Publicação na Ficha Unificada do Catálogo AR Bio

Escopo frontend-only, incremental e reversível. Nenhuma alteração de banco, migration, RLS, RPC,
Edge Function, aprovação técnica, precificação B2B, pedido B2B, planejamento ou publicação.

## Arquivos alterados

- `src/components/catalogo/CatalogoItemDrawer.tsx` — abas refinadas e helper de publicação.
- `src/test/catalogo/catalogo-item-drawer.test.tsx` — testes do diagnóstico de publicação e
  preservação dos fluxos existentes.
- `docs/auditorias/catalogo-fase26e.md` — este relatório.
- Restauração de baseline: `.env` e `src/integrations/supabase/types.ts` (commit `c75bb87f`,
  21.850 linhas) após drift detectado no início da execução.

## Abas da ficha unificada

Geral · Comercial · Volumes e Preços · Técnica · Publicação · Status · Composição (produto,
quando houver dados).

### Volumes e Preços

- Reaproveita apenas dados já presentes em `item.raw` — nenhuma query nova.
- Exibe `dose_ml_ha`, `valor_dose_brl`, `valor_litro_brl`, `valor_ha_brl`, unidade principal e a
  referência “1 L = 10 doses de 100 mL”.
- Quando `raw.volumes` é array, lista cada volume sem presumir schema fixo, usando
  `rotulo`/`nome`/`volume_litros`/`volume_ml` e preços `preco_brl`, `preco_litro_brl`,
  `valor_dose_100ml_brl` quando existirem.
- Sem volumes carregados: mantém o estado vazio canônico
  (`CATALOGO_FICHA_VAZIO_VOLUMES`) e acrescenta o texto auxiliar
  (`CATALOGO_FICHA_VOLUMES_AUXILIAR`).
- `CatalogoVolumesDialog` não é aberto e nenhum volume é editado nesta fase.

### Publicação

Somente leitura. Exibe situação, B2B habilitado, status da ficha e o diagnóstico de visibilidade
potencial para parceiro B2B e produtor, com motivo amigável. Não existe botão de
publicar/despublicar e nada é gravado.

## Helper de publicação

`catalogoFichaPublicacao(row)` retorna
`{ b2bVisivel, b2bMotivo, produtorVisivel, produtorMotivo }`:

- `b2bVisivel = ativo && b2b_enabled && ficha_status === 'aprovado'`
- `produtorVisivel = ativo && ficha_status === 'aprovado'`
- Motivos: “Item inativo”, “B2B desabilitado”, “Ficha não aprovada”,
  “Visível conforme regras atuais”.

Helpers já existentes mantidos e exportados: `catalogoFichaAlertas`, `fichaPermiteInterno`,
`fichaPermiteTextoB2B`, `fichaPermiteTextoProdutor`.

## Apenas diagnóstico visual

Toda a aba Publicação é diagnóstico derivado da linha já carregada. A regra real de publicação
continua nas RPCs canônicas (`get_partner_catalog_secure` e afins) e não foi tocada.

## Permissões por scope

- `produtor`: sem explicação B2B, sem fontes internas, sem auditoria, sem custo interno.
- `b2b`: sem explicação para produtor, sem fontes internas, sem auditoria, sem custo interno.
- `admin`/`interno`: diagnóstico completo, incluindo alertas e contagem de fontes.

## Fluxos preservados

`/base-tecnica`, redirecionamento de `/protocolos`, `/comercial/catalogo`, `CatalogoCardsGrid`,
botões “Ficha completa” e “Ver ficha”, `FichaProdutorDrawer`, `AddToCartDialog`,
`ProductTechnicalProfileDialog`, `MicroorganismTechnicalProfileDialog`, portal parceiro,
pedido B2B, aprovação técnica e PDFs — todos inalterados.

## Testes executados

- `connection-binding.static.test.ts`, contratos, navegação, protocolos e catálogo: 192 PASS.
- Suíte completa e build: ver seção de validação da execução.

## Pendências para 26F

- Paginação e colunas explícitas em `useCatalogoUnificado`.
- Carregamento sob demanda de volumes reais na ficha (hoje só o que já vem em `raw`).
- Convergência das visões mobile e B2B para as RPCs canônicas.
