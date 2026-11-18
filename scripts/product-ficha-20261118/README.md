# Ficha de produto — revisão incremental, NÃO liberada para publicação

Nenhuma aplicação hosted, publicação ou alteração de dados foi executada. Baselines de microrganismos permanecem intactos.

## Ordem e montagem

1. Confirmar baseline vigente de catálogo/dossiê e sequência microrganismos → documentos → correção segurança em cada ambiente.
   **Atualização root 03:48 UTC:** alinhamento mínimo `product_audit_hml_alignment_20261118` já aplicado somente HML, POST revisado e 29 Auth HTTP baseline PASS. Não recriar alinhamento nem repinar produção. Usar captura pós-alinhamento para revisão do novo delta; baseline não certifica nova ficha/fontes. Hashes no REPORT.
2. Capturar `pg_get_functiondef` completo UTF-8, MD5, OIDs, owners/ACLs, relações/constraints/policies/triggers e dependências do motor. Não usar o SQL histórico como captura exata.
3. `python3 build.py` produz **somente candidato de laboratório** `source.sql.review`.
4. Executar pelo conector validado `capture-query.sql.review` (somente catálogo). Exportar sem sanitizar strings/acentos como UTF-8/LF. Envelope exato:
   ```json
   {"ref":"vrlcdwmlytukrjezrrnf","provenance":"root-exact-catalog","reviewed_transitive_signatures":["public.tenant_catalog_root_save(text, uuid, jsonb, timestamp with time zone, uuid)","platform_private.recorte_a_actor_fresh(text)"],"catalog":{"functions":[],"relations":[],"config":[]}}
   ```
   `catalog` é o resultado integral da consulta, não preencher arrays manualmente. Cada função precisa signature/definition/md5/owner/acl/security_definer/config/volatility; cada relação inclui owner/RLS/ACL/columns/defaults/constraints/triggers+hash/policies/indexes. PL/pgSQL usa chamadas não registradas em pg_depend: root revisa recursivamente as definições e inclui as assinaturas transitivas na consulta/captura antes de montar. Não assumir fechamento transitivo só pelo catálogo de dependências.
   Assinaturas obrigatórias do motor: `public.tenant_catalog_root_save(text, uuid, jsonb, timestamp with time zone, uuid)`, `platform_private.recorte_a_actor_fresh(text)`, `platform_private.catalog_tenant_actor(text)`, `platform_private.tenant_catalog_receipt(uuid, uuid, text)`, `platform_private.tenant_catalog_ref_owner(text, uuid)`. Contratos metadata/composição e capability também são capturados; não os reimplantar.
   `python3 assemble.py --pre capture-pre.json --post capture-post.json --out DIRETORIO` exige captura exata de cada ambiente; POST vem de recomposição revisada em espelho isolado/HML com definições reais, jamais dos pins de test_pg. Ref produção explícito `swzpzcwiasxmjutrmvkm` também suportado sem executá-lo. Root canônico `7db253bcc2150276ea2bb2f7bd90e471`, fresh actor `0cb006c428fc13b0bf0fd7e2759f7a99`: não repinar para SQL histórico.
5. PRE/INSTALL/POST/RELEASE/ROLLBACK com comparação integral. Reexecução só aceita catálogo POST inteiro idêntico; qualquer DDL parcial falha fechado. Gate começa OFF; release e rollback verificam POST. Rollback fecha gate e conserva reader (que também verifica gate), histórico e motor; não restaura writer antigo nem apaga dados. O montador completo foi preparado; sua execução positiva ainda exige as capturas reais PRE/POST do root, não disponíveis nesta rodada.
6. Bundles `edges/hml` e `edges/production` são revisão, com binding build-time e check exato de URL, sem `Deno.env.set`. Reproduzir: `python3 build-edge.py --ref REF --out DESTINO`. Mantêm serviço existente e restringem campos por entidade produto. Não implantados.
7. Root realiza Auth A/B/anon/leitor/feature revogada, concorrência/lock/replay, IA real e salvar/reabrir fontes na HML antes de decidir qualquer produção/hosting.

Rollback deny-only fecha gate e o reader recusa consulta, retém histórico e motor seguro. Reverter frontend ao commit anterior caso necessário, sem desfazer produtos confirmados. Revalidar rollback/release no espelho exato antes de aplicação.

Todos os scripts leem/escrevem UTF-8 explícito e LF. Pins históricos não são substituídos para acomodar CRLF/CP1252.

## Contrato das fontes neste delta

Cada evidência de produto inclui `candidate_key` não vazio, `field`, `value` exato, identidade do produto e fontes HTTPS. Seleção por candidato+campo+valor precede persistência; SQL recusa ausência de candidato, texto divergente, produto estrangeiro e URL insegura. Campos comerciais/fiscais/formulação ficam fora. Nunca normalizar texto para fazer fonte coincidir. Microrganismos mantêm seu envelope anterior; não instalar novamente seus baselines.

Reader retorna `{product_id,profile_id,profile_revision,evidence,history}`. ID/revisão são sempre do perfil atual, obtidos no mesmo snapshot SQL do conteúdo e da última evidência aceita desse perfil. `evidence` contém somente campos cujo texto e identidade coincidem exatamente com o atual, sem trim/conversão; a fonte/candidato original é preservada. `history` é null ou `{profile_id,profile_revision,evidence}` de uma revisão anterior ou da mesma revisão quando houve retirada de atribuição ativa (por exemplo renomeação do produto sem alterar o perfil). Histórico da mesma revisão deve diferir da evidência ativa; revisão futura é recusada. É apresentado separadamente sem comprovar texto ou identidade divergente. Não cria histórico novo durante leitura. A última evidência explicitamente vazia impede ressuscitar snapshots anteriores. UI mantém comparação de revisão para detectar corrida entre consultas, e Retry releitura ambos; edição manual legítima não produz mismatch permanente. `history` opcional suporta o envelope anterior durante revisão, sem fallback para array/schema inválido.

### Identidade e renomeação — revisão 04:35

`identity` tem shape estrito: `entity:"produto"`, `id:UUID`, `name:string` (1–1000 caracteres), `manufacturer:string` e `registration:string` (0–1000; vazias permitidas, ausentes/null/números recusados). Opcionais `scientificName`, `strain`, `purpose`, `synonyms`, `concentration`, `presentation` são strings até 2000; `researchScope` é `species|product_strain`. Extras e tipos divergentes são recusados no SQL e cliente; fabricante/registro não são colunas novas nem prova regulatória.

Após renomeação, fontes com nome anterior deixam de ser ativas mesmo com texto igual e permanecem no histórico com identidade/candidato intactos. Em tela aberta o cliente filtra por ID+nome+texto; se só houver evidência de identidade anterior, omite `documentary_evidence` ao salvar outro campo (não grava snapshot vazio apagando a última proveniência). Evidência explicitamente vazia continua intenção de retirada. Novas sugestões precisam da identidade atual e aplicação explícita; SQL confere nome atual sob lock, e mudança concorrente exige reconciliação após recusa definitiva. Não adapta/reescreve identidade antiga para fazer a fonte passar.

## Vínculos integrados

`product_relations` segue na mesma chamada `tenant_catalog_root_save` de `product_technical_profiles`, sem novo RPC writer público. Cada alteração: `{kind:"crop|target|source",id:null|UUID,expected:null|linhaCompletaObservada,fields:{...}}`. Recomendações reais não têm updated_at: CAS compara JSONB completo após row lock; não inventa coluna/revisão. Fontes usam a mesma comparação incluindo updated_at. Campos de sistema/pai/tenant nunca entram em fields. Cultura selecionada persiste ID e nome canônico, servidor confirma nome. Fontes HTTPS e enums reais validados; helper owner-only reautoriza por fresh actor após esperas e antes de concluir. Perfil/filhos/recibo são uma transação; metadata/composição continuam duas chamadas separadas.

Rascunho de vínculo exige Aplicar/Cancelar e bloqueia salvar pai/trocar seção/fechar. Alteração já aplicada pode ser revista sem substituir a expectativa CAS automaticamente. Após recusa definitiva: releitura explícita do perfil permite retomar; vínculo conflitado precisa revisão e botão Reconciliar versão deste vínculo antes de reaplicar. Não há rebase/retry automático. Incerteza mantém intenção/chave e exportação.

## Revisão 04:16 — esquema estabilizado para captura root

Capturar `volatility: pg_proc.provolatile` além dos metadados já descritos; `capture-query.sql.review` foi atualizado. Nomes reais preservados: `platform_private.tenant_catalog_root_cfg` e `platform_private.tenant_catalog_root_receipts`. Assinaturas PRE permanecem as mesmas. POST acrescenta `public.tenant_product_documentary_read_v1(uuid)`, `platform_private.product_relations_apply_v1(uuid, uuid, jsonb)` e `platform_private.product_source_https_v1(text)`.

Somente `product_technical_profiles` troca o caminho de autoridade do motor para `recorte_a_actor_fresh`; inclui chamadas após gate/receipt/ref-owner/row-lock/DML/receipt-insert e antes de todo retorno, inclusive replay sem novos vínculos/evidências. Outros roots preservam sua autoridade. Reader VOLATILE usa fresh/read_catalog, gate com FOR SHARE, revalidação após espera e antes de retorno. Gate/history têm RLS sem policies client, ACL owner-only; sequência também fechada e índice `(product_id, sequence DESC)` no histórico. Não usar FORCE RLS sem política owner: o motor proprietário precisa alcançar o histórico privado.

Montagem positiva continua dependente das capturas integrais root PRE/POST e revisão no espelho; **não instalar `source.sql.review` preliminar**. Pins root7db253/fresh0cb006 preservados. Actor5e0ce9 STABLE, receipt e021, ref_owner9e2a23293124f7953b2d9b63d46a1890 VOLATILE são achados externos relatados, não novos pins autorizadores.

## Continuação 04:24 — assembly exclusivamente local do root

Capturas internas PRE/POST permanecem com root; não solicitar upload nem buscar/transferir por outro caminho. `assemble.py` continua parametrizado por caminhos locais `--pre`, `--post`, `--out`, valida corpo do reader novo além do root e aceita o delimitador de pg_get_functiondef sem normalizar conteúdo/hashes. Root pode utilizar seu builder final com este reader e esquema, preservando pins e checks de autoridade. Nenhum instalador positivo foi executado pelo agente. Assinaturas/tabelas permanecem iguais; única ampliação do envelope é `history` descrita acima.
