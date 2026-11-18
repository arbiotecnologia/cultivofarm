# Evidências exatas

- `tsgo --noEmit -p tsconfig.app.json`: saída vazia / código 0.
- Build automático: últimos registros `build OK`; build não executado manualmente por regra do ambiente.
- Catálogo: 51 arquivos / 975 testes PASS antes das últimas regressões aditivas; rodada final registrada a seguir.
- Focais: 3 arquivos / 28 testes PASS; fiscal compartilhado: 2 / 11 PASS.
- PostgreSQL 17.12 descartável: 19/19 componente, actor/root capturados reais; Auth, features, schema e uma dependência receipt reconstruída sintéticos. Não é cadeia JWT/RLS hospedada nem prova integral de triggers.
- Deno Edge: 6/6, auth/transport interceptados; deno check PASS. Sem deploy.
- Pesquisa real SDK `openai/gpt-6-astra`, web_search, espécie pública Bacillus subtilis: executada, retornou fontes Embrapa e Infoteca e resumo explícito geral; evidência JSON. Sem cliente, empresa ou chamada Edge autenticada.
- Playwright componentes reais + Auth/transporte interceptados: 1280×1800 e 390×844; salvar/reabrir cepa e fonte, 1 diálogo, sem overflow e sem pageerror. Screenshots inspecionadas em /tmp/browser/micro-ficha. Não é prova hospedada.
- Prévia pública `/base-tecnica`: primeira captura 1,8s vazia; inspeção posterior encontrou redirecionamento/login nos logs. Sem acesso autenticado, não certificada; não alteramos guards para contornar sessão.
- Produção: apenas metadados read-only. Preservação dos 27 micros é objetivo e roteiro de hash PRE/POST, não uma verificação de dados executada nesta sessão.

Rodada final: 54 arquivos / 997 testes PASS; typecheck saída vazia, exit 0.
