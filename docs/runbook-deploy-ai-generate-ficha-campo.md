# IA direta OpenAI — Cultivo Farm

As funções `ai-generate-ficha-campo`, `ai-sugerir-alvos` e `catalog-documentary-suggestions` usam a API Responses em `https://api.openai.com/v1/responses`, com `OPENAI_API_KEY` somente no servidor e `store: false`.

Texto: `gpt-6.1-terra`; pesquisa documental: `gpt-6-astra`. As variáveis opcionais `OPENAI_TEXT_MODEL` e `OPENAI_RESEARCH_MODEL` alteram os modelos no servidor. A pesquisa mantém busca web, JSON estruturado e filtro de URLs observadas na busca.

Este código incorpora as guardas já publicadas: as funções globais exigem superadministrador ativo; a pesquisa documental usa capacidade por ator/empresa, reserva de cota e revalidação após a inferência. Não ampliar papéis para testar. A função de ficha registra versões pendentes; pesquisa e alvos não aplicam conteúdo automaticamente.

## Publicação

Projeto de produção: `swzpzcwiasxmjutrmvkm`. Publicar somente as três funções com suas dependências `_shared`, preservando as opções JWT do config.toml. `binding.ts` da pesquisa é explícito para produção; homologação exige um artefato com vínculo específico, nunca copiar o vínculo de produção.

Antes da publicação, capturar bundles atuais e comparar alterações concorrentes. Após publicar, testar com sessão real, conferir fontes e revisão manual. Falta de chave/credencial retorna indisponibilidade; saldo esgotado retorna 402; limitação temporária retorna 429. Não registrar mensagens brutas ou credenciais do provedor. Não repetir automaticamente escritas ou requisições de inferência.

A assinatura ChatGPT e os créditos API são administrados separadamente. Créditos elegíveis precisam ser vinculados à organização API. Nenhuma chave deve ser adicionada ao repositório.

## Verificação

`node --test tests/openai-provider.test.mjs` valida transporte simulado, cancelamento, respostas parciais, falta de saldo e parsing TypeScript. Testes com mocks não substituem geração real autenticada no projeto publicado.
