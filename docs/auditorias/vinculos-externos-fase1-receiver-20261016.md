# Vínculos externos — correção focal do receiver (16/10/2026)

## Incidente e causa
- Evidência REAL informada pelo titular às 19:32 UTC: Admin AR no site publicado, após reload, viu os seis usuários com “Vínculo indisponível no momento”. Não reproduzida em sessão real pelo agente.
- Causa confirmada em código e reproduzida no teste: a query extraía `supabase.rpc` e chamava o método sem receiver. `SupabaseClient.rpc` depende de `this.rest.rpc`, portanto falhava antes do transporte.
- A RPC está ausente do arquivo de tipos canônico usado pelo cliente (`cultivofarm.types.ts`). Não importamos o arquivo legado `types.ts`, não regeneramos tipos nem criamos cliente paralelo.

## Delta mínimo
- `src/lib/configuracoes/userLinksQuery.ts`: adaptador focal de leitura, tipagem estrutural restrita sobre o cliente canônico, chamada `client.rpc(...)` preservando o receiver, encaminhamento do AbortSignal e parser estrito existente.
- `src/pages/Configuracoes.tsx`: a query existente chama esse adaptador. Chave de cache ator/empresa/página, enabled, retry=false, consulta em lote e estados visuais permanecem iguais.
- `src/test/config/userLinksQuery.test.ts`: cinco regressões executam o adaptador usado pela página, com método que acessa `this.rest.rpc`: extração antiga falha; caminho corrigido retorna o contrato; negação de acesso, retorno malformado e falha de transporte continuam erros.
- `AGENTS.md` e `roadmap.md`: regra técnica e estado atualizado. Fase 2 não iniciada.

## Evidências locais
- Vitest focal: **30/30 PASS**, dois arquivos: parser/estados **25/25**, integração **5/5**. O relatório anterior indicava 30 no arquivo do parser; a execução desta rodada encontrou 25, não confundir com o total desta rodada.
- Lint: adaptador e teste novos sem erros; `Configuracoes.tsx` tem **18 erros/0 avisos**. Comparação automática com a mesma página no HEAD anterior: **18/0**, mesmos pares regra/mensagem; nenhum diagnóstico novo. Não alegamos lint global limpo.
- Build automático: **build OK 2026-10-16T19:34:29Z**. Nenhum build manual executado.
- Typecheck dedicado: **não executado manualmente**, por restrição do ambiente; não há log separado disponível para certificar seu resultado. Build não é apresentado como substituto. Revisão independente deve executar typecheck antes da publicação.
- Scanner F4b: **43/43 PASS**; SMTP intacto. `git diff --check` sem erros.
- Sem SQL/migration/deploy/publicação, alterações de usuários, papéis, vínculos, Auth, SMTP ou segredos.

## Referência e rollback
- Base conferida: `f70dd6da4a021c4fe4c1a6ed57f8d269c1ecf553`. O commit do delta é gerenciado pelo histórico da plataforma após o turno; não há hash final verificável antecipadamente nem commit Git manual.
- Rollback exclusivamente de código: reverter a integração do adaptador e seus testes se necessário; nenhuma alteração de dados ou contrato SQL. A versão anterior tem o defeito documentado; reverter não restaura leitura funcional.
- Leitura dos seis usuários na sessão REAL Admin AR permanece **pendente da revisão/publicação pelo titular**. Não certificamos o site publicado com teste simulado.
- Fase 2 continua pendente; nenhum SQL de escrita será aplicado neste recorte.