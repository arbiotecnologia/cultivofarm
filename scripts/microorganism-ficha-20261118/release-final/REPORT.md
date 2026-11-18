# Complemento final — preparação revisável, sem execução de produção

## Evidência hospedada recebida do root
- Baseline12a580416 instalado/released HML: 26 verificações Auth reais, IA Embrapa com gerar/aplicar/salvar/reabrir fontes e browser desktop/mobile PASS (relato anterior).
- Documentosd7dc4def instalado/released HML: upload/visualização PDF browser PASS e 7 checks Auth reais PASS — lista própria/B negada, bytes próprios, SHA256 igual, no-store, B e anon negados (relato03:01).
- Esses resultados não são execução hospedada deste agente nem certificação de produção. HML aplicada deve ser preservada; não reaplicar baseline/documentos.

## Artefatos completos
- `edges/{ref}/{documents,documentary}/`: bundles concretos determinísticos e manifest SHA256 por arquivo; binding.ts const explícita HML/produção, sem Deno.env.set em runtime e SUPABASE_URL exata. Sem secrets.
- `captures/{ref}.sql.review`: textos read-only explicitamente vinculados, nunca executados pelo agente. Exigem prova independente do destino pelo conector antes da leitura.
- `../documents/assemble.py`: gera PRE/INSTALL/POST/ROLLBACK/RELEASE para **ambos refs** a partir da captura exata por ambiente, sem inventar pins/ACL/fingerprints.
- `../root-audit-delta/`: correção segurança aditiva, pins PRE/POST definidos e rollback deny-only. `../assemble.py`: montagem baseline com roundtrip da captura UTF-8 obrigatório; SQL baseline existente intacto.
- Todos scripts Python de leitura/escrita de texto neste pacote usam UTF-8 explícito e saídas LF. Captura psql usa client encoding UTF8 e decode UTF-8. Nenhum ajuste automático de pins; harness baseline agora compara os pins definidos, não os regrava.

## Ordem e gates
**baseline → documentos → correção segurança**, com captura/PRE/POST próprios de cada etapa e ambiente. Não usar captura HML como prova de produção. Antes de documentos, exigir baseline/root/save e bucket privado10MiB exatos; antes da correção, exigir read/save antigos exatos. A correção altera save, portanto PRE/release antigos de documentos não podem ser usados como verificador genérico da composição final.

Rollback inverso deny-only: segurança fecha read/save; documentos fecha gate/EXECUTE; baseline fecha seus gates. Reter versões/objetos/recibos/histórico, nunca restaurar bypass, URL insegura ou concessões automáticas.

**Não há captura hosted de produção nesta execução:** não fabricar SQL PRE/POST específico ou prontidão de implantação. Fontes, montadores e bundles para produção estão prontos para revisão; execução exige captura exata e autorização posteriores. HML segurança/nova montagem ainda exige prova dos deltas pelo root. Revogação real durante bytes/locks, negativas diretas Storage e segunda versão/CAS real não foram relatadas e continuam provas específicas, não substituídas por testes locais.

## Evidência local deste complemento
- 4 testes de montagem/ref/UTF-8: bindings HML e produção, ref ausente/divergente negado, bytes LF, corpo acentuado preserva MD5 e CP1252/CRLF são recusados antes da montagem.
- Runtime de documentos dos dois bundles sem rede: URL exata atravessa binding e para na configuração ausente; URL divergente retorna document_binding_required. Fonte HML aplicada não foi redeployada.
- PostgreSQL descartável documentos34/34 (inclui montagem produção com **captura sintética exata**, não produção real); correção segurança17/17; pins originais preservados.
- Deno check dos quatro bundles PASS, Edge documentos13/13, baseline PG42/42 sem repinar e catálogo1036/1036 em56 arquivos; logs em evidence. Typecheck automático exit0 (`b9a11200-6493-4bf0-8607-5155463dac66.log`), build automático OK03:07:18; nenhuma implantação, conexão hosted, produção/publicação ou subagente.
- Frontend inalterado neste complemento; navegador real/PDF corresponde ao relato root e navegador local anterior, não reclassificado como execução nova.

**Pacote de revisão concluído; não é GO de produção/publicação.**