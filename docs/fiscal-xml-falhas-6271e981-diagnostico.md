# Diagnóstico das falhas XML/Edge após `6271e981` (22/10/2026)

Somente investigação. Nenhum teste nem código foi corrigido. Sem SQL, deploy ou publicação.

## Execução
`npx vitest run src/test/fiscal src/test/security` em HEAD: 6 falhas / 2530 aprovados / 4 ignorados.
(Rodada anterior registrou 5; a 6ª — `d51-5-p1-fiscal` — é da mesma causa e falha de forma determinística.)

## Causa comum
`6271e981` trocou, em `supabase/functions/fiscal-xml-engine/index.ts`:
1. `await req.json()` por leitura limitada (16 KiB / 5 s) + `JSON.parse` único;
2. o ramo `download` passou a vir **antes** do comentário "Cliente do usuário: toda autorização" e tem autorização própria (`fn_fiscal_can_operate` + leitura RLS de `fiscal_xml_runs` + `h15_service_actor_run_access`, repetidas após os bytes);
3. `createSignedUrl` foi removido (entrega por bytes, sem URL).

O bloco `xsd-selftest` é **byte-idêntico** antes/depois (diff vazio). Os testes recortam o texto por marcadores fixos; o recorte agora engloba o ramo `download`.

## Falha a falha
| Teste | Motivo | Veredito |
|---|---|---|
| Xerces: selftest não devolve texto do validador | recorte inclui `download` (`catch (error)`, `String(`) | obsoleto |
| Selftest: body parseado uma vez | procura `await req.json()`, agora 0 ocorrências; há 1 `JSON.parse` | obsoleto |
| Selftest: diagnóstico enum sanitizado | recorte inclui `catch (error)` do `download` | obsoleto |
| Selftest: não toca banco/Storage | recorte inclui `.from(`/`.storage.`/`createClient` do `download` | obsoleto |
| transportPersistenceSafety: perfil fiscal no edge | 1º `fn_fiscal_can_operate` (linha 375) está dentro do `download`, depois do `if (action === "download")` (332); a regra real (perfil antes de banco/Storage) continua valendo dentro do ramo | obsoleto |
| d51-5: ownership antes de URL assinada | `createSignedUrl` não existe mais (-1); `h15_service_actor_run_access` (381) vem antes de `storage.download` (409) | obsoleto |

## Conclusão
Nenhuma regressão real encontrada: os 6 testes verificam a forma antiga do texto, e as garantias que eles protegem continuam presentes no código atual. Limite: prova estática (leitura do código), não execução real com JWT/RLS da Edge.

## Achado extra (sem correção)
`xmlEngineXsdSelftest` "parse do body antes do selftest" passa **por vazio**: `indexOf("await req.json()")` = -1 < selftest. Deve ser reescrito junto com os demais.

## Próximo passo sugerido (aguarda autorização)
Atualizar os 6 testes para marcadores atuais (fim do selftest = `if (action === "download")`; `JSON.parse` único; ordem perfil→h15→`storage.download`; ausência de `createSignedUrl`) e corrigir o teste que passa por vazio.
