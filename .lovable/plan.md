# Editor estruturado de limites e funcionalidades — gate de arquitetura

## Diagnóstico
- O fluxo atual já possui catálogo de módulos e funcionalidades, vínculos por plano, versões DRAFT/PUBLISHED/ARCHIVED, snapshots e RPCs auditadas.
- O estado vivo contém módulos, funcionalidades e 54 vínculos de plano, porém nenhum vínculo possui `limit_value` ou `config`; não há versão comercial nem limite real cadastrado.
- `saas_modules` e `saas_features` possuem nome e descrição, mas não registram metadados necessários para limites: chave canônica, nome, descrição, categoria, unidade, forma de aplicação e tipo de valor.
- Não há catálogo equivalente de limites. Portanto, construir agora os três estados pedidos exigiria inventar chaves e semânticas comerciais, o que está proibido.
- As RPCs atuais aceitam `limits_snapshot` como qualquer objeto JSON. Elas não rejeitam chave desconhecida, tipo inválido ou duplicidade semântica e não validam dependências/comercializabilidade explícita das funcionalidades.
- A seleção atual usa funcionalidades ativas vinculadas ao plano, mas o catálogo não distingue funcionalidade interna de comercializável nem registra dependências.

## Decisão deste gate
**NO-GO para implementar somente a interface.** A estrutura atual é insuficiente para cumprir as validações server-side e a semântica dos limites sem uma evolução de schema/RPC. Nenhuma migration, RPC, dado comercial ou tela será alterada antes da aprovação deste plano.

## Proposta compatível
1. Criar um catálogo global de definições de limite, sem valores comerciais, contendo chave estável, nome, descrição, categoria, unidade, tipo numérico e forma de aplicação.
2. Vincular limites permitidos às funcionalidades existentes, sem criar permissão de módulo paralela.
3. Acrescentar ao catálogo de funcionalidades metadados explícitos de comercialização e dependências, preservando as chaves atuais.
4. Manter `limits_snapshot` e `saas_plan_version_features` como contratos históricos; o editor apenas gera o JSON e a lista já aceitos pelas RPCs.
5. Endurecer a RPC de rascunho para validar, na mesma transação: chaves conhecidas, estados distintos, valores não negativos, tipos, duplicidades, comercializabilidade e dependências.
6. Na publicação, congelar no snapshot os metadados necessários para leitura histórica, sem alterar versões já publicadas.

## Compatibilidade legada
- Rascunho com JSON reconhecido será convertido para o editor estruturado sem perda.
- Chaves legadas desconhecidas permanecerão visíveis em uma área técnica somente leitura e bloquearão publicação até revisão; nunca serão descartadas silenciosamente.
- Ausência, zero, limitado e ilimitado terão representações distintas no contrato versionado.
- Versões publicadas continuarão imutáveis; assinaturas e snapshots existentes não serão regravados.

## Interface após aprovação do backend
- Limites: busca, agrupamento por categoria, contador, resumo, “Adicionar limite”, estados Não incluído/Limitado/Ilimitado e JSON técnico recolhido.
- Funcionalidades: agrupamento por módulos existentes, seleção tri-state por módulo, busca, filtro de selecionadas, ações em lote com confirmação e comparação com a última versão publicada.
- Estados de carregamento, vazio, erro, teclado e mobile serão preservados no editor atual.

## Segurança e validação
- Escrita continuará exclusivamente pelas RPCs `platform_*`, derivando o ator de `auth.uid()` e exigindo Platform Superadmin no servidor.
- RLS, tickets transacionais, idempotência, auditoria append-only, imutabilidade e gates fail-closed serão preservados.
- Nenhum valor de limite será criado por migration; definições reais deverão ser aprovadas pelo proprietário antes de qualquer carga.

## Validação prevista
- Testes unitários da serialização e estados dos limites, compatibilidade legada, agrupamento/tri-state, busca e comparação.
- Testes server-side de chave forjada, tipo, negativo, dependência, comercializabilidade, autorização, imutabilidade e isolamento A/B.
- Regressões de sidebar, URL direta e operações protegidas.
- Typecheck, lint focado, testes focados, build e advisors.

## Riscos e rollback
- Principal risco: alterar a interpretação histórica de `null`, ausência e ilimitado. Mitigação: representação versionada explícita e leitura legada separada.
- Rollback funcional: ocultar o editor estruturado e manter leitura técnica dos rascunhos; a evolução será forward-only, sem apagar catálogo ou histórico.
- Cobrança, publicação do aplicativo e criação/publicação de versões comerciais permanecem fora do escopo.
