# Continuação mobile e contratos locais — 12/11/2026

## Entrega na prévia
- Entradas existentes `/app/catalogo` e `/base-tecnica`: seção compacta, famílias (incluindo vazias e Sem classificação), busca em todas quando vazio, reutilização do editor canônico, ficha Criar/Editar, confirmação de saída e controles de 44px.
- Cards do catálogo abrem ficha por toque ou teclado. Formulário em uma coluna no mobile; revisão documental atual/sugestão por campo, aplicação separada do salvamento. Erros mantêm formulário.
- Problemas próprios e vínculos de cultura/problema montados nas fichas próprias. Inclusão inline mantém observação/rascunho da ficha. Leitura dos problemas históricos preservada, sem mutadores globais.
- Famílias usam `tenant_catalog_active_families_v1` candidato; enquanto não disponível, a UI usa somente os três nomes canônicos já documentados, sem alegar fonte dinâmica instalada. Resposta válida vazia não é substituída por defaults.

## Contratos executáveis, não instalados
Arquivos nesta pasta: `install.sql` (PRE incluído, gate OFF, ACL fechada), `post.sql`, `rollback.sql`, `activate-local.sql` (somente descartável), `test_local.py` e `service/`.
Problemas/vínculos em tabelas privadas; autoridade canônica, owner por servidor, locks de referências, reautorização, CAS e recibos. Sem DML público, grants amplos, migração hospedada ou modificação dos controles existentes.
O PRE local comprova dependências presentes, não captura integral LIVE nem certifica composição de produção. **Pacote é candidato revisável, não GO de instalação.**

## Serviço documental
`service/index.ts` é um Edge executável fora do caminho de deployment automático; JWT verificado, binding canônico, capacidade antes/depois, sem service role/gravações. `capability.sql.review` na pasta superior depende da fundação/gate e permanece sem EXECUTE cliente. A montagem precisa de revisão/aprovação separada e segredo do serviço AI no ambiente servidor.
Busca pública real exercitada com `openai/gpt-6-astra`/Responses + web_search, saída JSON estruturada e fontes corroboradas por URLs retornadas. Uma sugestão comercial de Roundup Original DI foi retornada com bula/FISPQ públicas Bayer. Primeiro retorno sem schema falhou fechado por fabricante ausente; após ajuste, fabricante null preservado. Sem dados de clientes ou produção/cultivo microbiano. Corroboração de URL não equivale a validação humana de cada afirmação; fontes devem ser revisadas.

## Evidências
- 78/78 testes Vitest em seis arquivos (SDK real com transporte sintético), incluindo editor/leitor, CAS, tenant, inline, draft, fontes e contenção global.
- 17/17 checks PG descartável: instalação fechada, roundtrip, replay, CAS, outros papéis/tenant, referências estrangeiras, DML negado, rollback e famílias. Autoridade capturada carregada verbatim MD5 `5e0ce9cc9122f1c21d76e29a13de8b59`; dependências Auth/feature sintéticas declaradas. Não é espelho completo original nem prova JWT hospedada.
- Deno check do serviço montado PASS.
- Playwright 360/390px nas duas páginas reais, com módulos reais + identidade/transporte sintéticos e rede hospedada bloqueada: formulários/seletores/continuar-descartar, sem overflow horizontal e sem pageerrors; leitor sem adicionar produto. Não exercitou sessão real nem persistência hospedada.
- Último build automático observado OK.

## Pendências de ativação e limites
1. Revisão independente, pins LIVE completos e aprovação de instalação/ativação para problemas/vínculos/famílias/capacidade documental; nada foi aplicado.
2. Implantação autorizada do serviço candidato e configuração servidor AI. Botão na prévia continua retornando indisponibilidade segura enquanto endpoint ausente.
3. Sessões reais editor/leitor/empresa B não verificadas; AR Bio usada apenas como nome fictício.
4. Busca/rolagem ao fechar detalhe ficam na página montada; retenção completa entre remounts/navegação de seção da Base Técnica e todas as saídas com rascunho não foi homologada. No mobile produtos visitados mantêm editor montado; não há novo armazenamento persistente de autoridade/dados.
5. Edição/desativação de vínculo existente e concorrência/revogação pós-espera de toda composição nova não estão cobertas pela bateria; contrato suporta CAS, UI atual oferece inclusão/listagem. Revisão deve resolver essas lacunas antes de ativar.

Nenhuma publicação, SQL hospedado, alteração de dados reais, emissão ou cobrança.
