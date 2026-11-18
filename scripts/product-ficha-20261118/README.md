# Ficha de produto — revisão incremental, NÃO liberada para publicação

Nenhuma aplicação hosted, publicação ou alteração de dados foi executada. Baselines de microrganismos permanecem intactos.

## Ordem e montagem

1. Confirmar baseline vigente de catálogo/dossiê e sequência microrganismos → documentos → correção segurança em cada ambiente.
   **Atualização root 03:48 UTC:** alinhamento mínimo `product_audit_hml_alignment_20261118` já aplicado somente HML, POST revisado e 29 Auth HTTP baseline PASS. Não recriar alinhamento nem repinar produção. Usar captura pós-alinhamento para revisão do novo delta; baseline não certifica nova ficha/fontes. Hashes no REPORT.
2. Capturar `pg_get_functiondef` completo UTF-8, MD5, OIDs, owners/ACLs, relações/constraints/policies/triggers e dependências do motor. Não usar o SQL histórico como captura exata.
3. `python3 build.py` produz **somente candidato de laboratório** `source.sql.review`.
4. Captura JSON: `{ref, functions:[{signature,definition,md5}]}`. Montagem `python3 build.py capture.json output-dir post-capture.json` exige ref explícito HML `vrlcdwmlytukrjezrrnf` ou produção `swzpzcwiasxmjutrmvkm`, roundtrip MD5 e fundamentos revisados. POST deve vir da recomposição descartável exata revisada, nunca de `post-pins.json` sintético. Divergência exige revisão, não repin automático.
5. Revisar PRE/INSTALL/POST/RELEASE/ROLLBACK; gate de evidências inicia OFF. Instalação é one-shot, não reexecutar; ainda falta fechamento integral de ACL/trigger/estrutura, portanto **não instalar artefatos preliminares**.
6. Bundles `edges/hml` e `edges/production` são revisão, com binding build-time e check exato de URL, sem `Deno.env.set`. Reproduzir: `python3 build-edge.py --ref REF --out DESTINO`. Mantêm serviço existente e restringem campos por entidade produto. Não implantados.
7. Root realiza Auth A/B/anon/leitor/feature revogada, concorrência/lock/replay, IA real e salvar/reabrir fontes na HML antes de decidir qualquer produção/hosting.

Rollback deny-only fecha gate/revoga reader, retém histórico e motor seguro. Reverter frontend ao commit anterior caso necessário, sem desfazer produtos confirmados. Revalidar rollback/release no espelho exato antes de aplicação.

Todos os scripts leem/escrevem UTF-8 explícito e LF. Pins históricos não são substituídos para acomodar CRLF/CP1252.

## Contrato das fontes neste delta

Cada evidência de produto inclui `candidate_key` não vazio, `field`, `value` exato, identidade do produto e fontes HTTPS. Seleção por candidato+campo+valor precede persistência; SQL recusa ausência de candidato, texto divergente, produto estrangeiro e URL insegura. Campos comerciais/fiscais/formulação ficam fora. Nunca normalizar texto para fazer fonte coincidir. Microrganismos mantêm seu envelope anterior; não instalar novamente seus baselines.

Reader retorna `{product_id,profile_id,profile_revision,evidence}`; evidências são filtradas pela revisão atual e a UI compara essa revisão com o perfil observado antes de hidratar. Envelope antigo/array não é fallback válido: schema incorreto aparece como erro. Histórico privado anterior é retido.