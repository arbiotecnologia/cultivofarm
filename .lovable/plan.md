# Consulta de CNPJ na tela fiscal da empresa

## O que está acontecendo

O botão "Buscar dados (BrasilAPI)" da tela de identificação fiscal não fala direto com a base pública: ele chama um serviço interno próprio (`fiscal-cnpj-lookup`). Esse serviço não está publicado no ambiente atual — a chamada responde "não encontrado" (HTTP 404), e a tela traduz isso como "Falha de rede ao consultar a base pública".

Verificado nesta sessão: a requisição ao endereço do serviço no projeto canônico retorna 404.

Os cadastros de Cliente e de Parceiro B2B não usam esse serviço — eles consultam a base pública diretamente e funcionam.

## O que será feito

Alinhar a tela fiscal ao mesmo mecanismo já usado em Cliente e Parceiro:

1. A consulta passa a ir direto à base pública, como nos outros cadastros.
2. Mantém tudo que já existe na tela fiscal:
   - validação do CNPJ (incluindo dígito verificador) antes de consultar;
   - cancelamento da consulta ao sair da tela e tempo limite;
   - janela de confirmação antes de preencher, listando os campos que serão alterados;
   - o CNPJ digitado nunca é alterado pelo retorno;
   - lista fechada de campos preenchíveis (nenhum campo protegido é tocado);
   - CNPJ com letras continua sem consulta automática (a base pública ainda não suporta), com preenchimento manual.
3. Mensagens de erro específicas por situação: não encontrado, excesso de consultas, base indisponível, tempo esgotado, falha de rede.
4. O código do município (IBGE) não vem nessa consulta: o campo continua sinalizado como "preencher manualmente", como já acontece hoje quando não é resolvido.

## Detalhes técnicos

- `src/lib/fiscal/cnpjLookup.ts`: trocar `supabase.functions.invoke("fiscal-cnpj-lookup")` por `fetch` direto a `https://brasilapi.com.br/api/cnpj/v1/{cnpj}`, mapeando status 404/429/5xx/abort para os códigos existentes (`not_found`, `rate_limited`, `upstream_error`, `timeout`, `network_error`). Mantidos o contrato `CnpjLookupResult`, o `AbortSignal`, `LOOKUP_TARGET_FIELDS` e o filtro de whitelist.
- `ibgeUnresolved` passa a ser sempre `true` quando o município não puder ser resolvido localmente; `taxRegimeHint` continua derivado de `opcao_pelo_simples` / `opcao_pelo_mei`.
- `src/components/fiscal/CnpjLookupButton.tsx`: sem mudança de comportamento; apenas os códigos de erro já tratados.
- A Edge Function `supabase/functions/fiscal-cnpj-lookup/` permanece no repositório, sem deploy, para uso futuro caso se queira voltar ao canal server-side.
- Sem alteração de banco, de regras fiscais, de cálculo ou de emissão. Nada publicado.
- Atualizar `src/test/fiscal/cnpjLookup.test.ts` para o novo canal (mock de `fetch`), preservando os casos de CNPJ inválido, alfanumérico, 404, 429, timeout e whitelist de campos.
- Validações ao final: `vitest src/test/fiscal`, typecheck e build; gate de conexão exclusivamente `swzpzcwiasxmjutrmvkm`.
