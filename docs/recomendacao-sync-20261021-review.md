# Correção focal — recomendações, 21/10/2026

Baseline de homologação externa informado: **33425615**. Somente patch local; nenhuma alteração de filas reais, SQL, Edge ou publicação.

## Contrato comprovado por leitura

Destino conferido em `supabase/config.toml` e cliente canônico: `swzpzcwiasxmjutrmvkm`.
Definições LIVE de `rpc_upsert_recomendacao_visita`, workspace, guard de gestão e enums inspecionadas somente por SELECT.

- Recomendação existente exige versão **igual** à atual; nova exige **1**. O servidor incrementa a sucessora.
- Objetivo, estratégia e modo são enums. Campos opcionais vazios continuam permitidos; texto livre inválido é rejeitado sem conversão silenciosa.
- Workspace prova visita/edição ou participação ativa em status editável; o upsert revalida autorização/cadeia/status e mantém a trava e conflitos LIVE intactos.
- Replay usa o cliente canônico, perfil ativo do ator no tenant de origem e fences de readiness/papéis/época/lease. ID remoto é locator, nunca autoridade.

## Patch

- Três seletores substituem os Inputs livres, sem alterar catálogo ou encaminhamento.
- Salvamento conserva a versão observada; editar nova pendência revisada mantém 1, e UUID é preservado.
- Entradas novas carregam origem ator/tenant, parent remoto explícito e marcador do contrato esperado. Não há migration IndexedDB: campos opcionais na store existente.
- Botão Sincronizar aceita parent explícito sem mapping; mapping existente continua apenas locator. Não fabrica mapping nem deduz parent pelo UUID local.
- Replay e envio imediato compartilham prova LIVE/fences. Conflito/negação ficam na fila; nenhuma tentativa de buscar versão nova para sobrescrever.
- Cleanup/erro usam comparação de `updatedAt` para não apagar/sobrescrever edição mais nova. Retorno sem recibo id/UUID/versão comprovados não limpa pendência.
- Outro ator/tenant ou legado sem origem comprovada não é enviado nem reescrito. Progresso registra falha local; recomendações não escrevem sync_log com identidade potencialmente trocada.

## Bloqueio da pendência histórica

A fixture informada `dafabf5e-ea63-447b-959a-a63483d69ae5` e o clientUuid `2ab7fdbb-4d60-441a-aec9-3f826d63c37b` **não foram lidos nem alterados**.
Se sua entrada histórica não possui autoria/tenant e versão esperada comprovados, permanece bloqueada: acesso atual à visita não prova quem criou um rascunho local antigo. Não foi inventada adoção/mapping para recuperá-la. Esse caso exige revisão da proveniência e correção humana antes de reenvio; nenhum reparo automático foi autorizado.

## Impacto irmão, sem refactor

`WizardDiagnosticoStep` também incrementa contador local e seu replay depende exclusivamente de mapping. Porém o LIVE diagnóstico usa contrato diferente (`expected < existing` causa conflito; criação aceita `GREATEST(1, expected)`), não igualdade como recomendação. Registrado para recorte separado; não alterado.
Campo já armazena parent remoto explícito. Filas de registros/checkins/campo/diagnóstico/mídia e suas políticas de origem **não foram certificadas nem modificadas** nesta correção. Não há certificação global de filas multiator.

## Validação e limites

- 76/76 testes locais em 7 arquivos: enums concretos, criação/edição/pendingnew, conflito, autorização negada, parent ausente, owner alheio/legado, logout/tenant/época sem unmount, CAS e integração do botão Sincronizar com IndexedDB isolado.
- Harness automático: `build OK` às **21:05:13Z** e **21:05:41Z**, após correção das duas falhas de tipos iniciais. Typecheck/build manuais não executados por restrição do ambiente; sem recibo independente de tipos.
- Testes usam transporte mock e IndexedDB descartável: **não** são JWT/RLS/browser LIVE. Homologação real do frontend e da recuperação histórica continua pendente do proprietário.
- Upload técnico A 5647B/SHA informado, POST próprio200/B403 e imagem UI OK são evidências externas anteriores, não ensaios deste patch.
- **Origin-deny consultor não aplicado. CDN/cache antigo SU-518022 não resolvido.** Nenhum suporte/upgrade/objeto/chave/papel/sessão alterado.

SHA e diff para revisão: `docs/recomendacao-sync-20261021.sha256` (fontes finais); commit automático consultável no histórico. Artefatos não equivalem a publicação.