# Análise para decisão — Renomear o módulo "Protocolos" ou criar entidade real e versionada

Documento de decisão. **Nada foi implementado** quanto à entidade "Protocolo": exige nova aprovação.
Ambiente de referência: staging `ikaauvsflpmamgxmkhoq` (produção não acessada).

## 1. Situação atual

- Rota `/protocolos`, item de menu "Protocolos", abas: Produtos, Microrganismos, Catálogo Técnico, Culturas, Problemas.
- **Não existe** tabela `protocolos` nem `protocolo_itens` no schema. O módulo é, na prática, **administração de catálogo técnico e cadastros mestres**.
- Versionamento existente é de **ficha técnica** (`ficha_tecnica_versoes`, `product_technical_profiles`, `microorganism_technical_profiles` com `status_validacao` e aprovação auditada), não de protocolo.
- Consequência: o menu promete um conceito que o sistema não modela. Usuários procuram "protocolo" e encontram cadastros.

## 2. Opção A — Renomear o módulo (baixo custo)

Renomear para **"Catálogo Técnico"** ou **"Cadastros Técnicos"**.

- Esforço: baixo (label em `src/config/navigation.ts`, título da página, keywords de busca; rota pode ser mantida por compatibilidade, com redirect opcional de `/protocolos`).
- Risco: baixo. Sem impacto em banco, RLS, preços ou fiscal.
- Ganho: elimina expectativa falsa; alinha nomenclatura ao que existe.
- Limitação: não entrega nenhuma capacidade nova.

## 3. Opção B — Criar entidade real e versionada de Protocolos (alto custo)

Modelo mínimo viável:

- `protocolos` (código, nome, cultura_id, alvo/problema, status: rascunho/publicado/arquivado, versão, vigência).
- `protocolo_versoes` (snapshot imutável do conteúdo publicado + autor + data).
- `protocolo_itens` (produto/microrganismo, dose, fase, ordem, intervalo, unidade).
- Vínculos de consumo: recomendação do consultor, OS on-farm, catálogo/simulador (aplicar protocolo ao carrinho).

Requisitos não negociáveis se avançar:
- Snapshot imutável na publicação (mesmo padrão já usado em pedidos B2B e fiscal).
- RLS: escrita restrita a `administrador`/`gestor`/técnicos autorizados; leitura de versões publicadas para produtor/parceiro conforme perfil.
- Integração com o motor de preços **sem** duplicar resolução de preço: o protocolo define itens/quantidades; preço continua resolvido pelas RPCs canônicas.
- Migração de conteúdo existente (hoje disperso em recomendações por cultura e fichas técnicas).

Esforço estimado: alto (schema + RLS + RPCs de publicação + UI de edição/versionamento + integração carrinho + testes E2E). Risco médio-alto de sobreposição conceitual com `ficha_tecnica_versoes` e com `product_crop_recommendations`.

## 4. Opção C — Renomear agora, avaliar entidade depois (recomendada)

1. Renomear o módulo para "Catálogo Técnico" (Opção A), resolvendo o desalinhamento imediato.
2. Levantar com o time agronômico/comercial se "protocolo" é um artefato publicável para o cliente (com versão e vigência) ou apenas um agrupamento de recomendações já existente.
3. Só criar a entidade (Opção B) se o requisito for publicação versionada com consumo em pedido/OS — caso contrário, estender `product_crop_recommendations`/fichas técnicas cobre o uso.

## 5. Pergunta de decisão para o proprietário

- O "protocolo" precisa ser **publicado com versão e vigência** e consumido em carrinho/OS? Se **sim** → Opção B (nova aprovação e planejamento próprio). Se **não** → Opção A/C.

Nenhuma das opções foi implementada.
