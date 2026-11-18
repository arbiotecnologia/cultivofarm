# Delta aditivo — documentos exclusivos de microrganismo

Candidato independente sobre **12a580416**. Nenhum instalador baseline foi alterado; nenhuma conexão, escrita em produção ou publicação é feita pelos scripts deste diretório.

## Contrato
- Material documental do microrganismo próprio, mesmo sem produto comercial. Não duplica dossiê de produto, não cria aprovação técnica/regulatória/fiscal.
- Admin/Gestor canônicos anexam; leitores autorizados pelo `catalog_tenant_actor('read_catalog')` consultam apenas o tenant proprietário. Globais não recebem writer nem novos anexos.
- PDF/PNG/JPEG, bytes reais e SHA-256, até **10 MiB** cada; **50 versões/reservas por microrganismo**, **500 MiB por tenant**, **20 reservas por ator/hora**, **2 pendentes simultâneas por tenant**. Reservas expiradas contam no armazenamento até manutenção revisada; não há delete automático.
- Preparar reserva com CAS observado e intenção idempotente → Edge mede/transporta bytes → atesta integridade → commit com JWT do ator e motor canônico de raiz → versão/recibo atômicos. Storage e transação SQL são separados: falha pode deixar objeto privado órfão/reserva, nunca falso rollback.
- Substituição cria versão imutável, não sobrescreve objeto. Replay usa a mesma chave, argumentos e arquivo; drift/revogação negam antes de retornar recibo.
- Consulta é POST autenticado, prova antes/depois dos bytes, `private, no-store`, sem signed URLs/GET público. Cliente valida hash/tipo/tamanho e revoga Blob ao fechar/mudar contexto.

## Instalação e montagem por ambiente — execução somente pelo root após gates
**Atualização 03:01:** root informou documentos d7dc4def já instalados/released somente HML, upload/visualização PDF reais PASS e 7 verificações Auth/bytes/hash/no-store/isolamento PASS. Não reaplicar baseline ou documentos na HML; aplicar apenas deltas ainda pendentes. A montagem para produção abaixo é offline, não autoriza sua execução.
1. Provar `vrlcdwmlytukrjezrrnf` pelo conector. Baseline já instalado/released pelo root conforme relato 02:49; não reaplicar. Validar o estado antes do delta.
2. Storage API: criar `microorganism-documents`, `public=false`, `file_size_limit=10MB`, tipos PDF/PNG/JPEG quando suportado. Não usar SQL para buckets.
3. Capturar funções integrais, owner/ACL, relações/guards e bucket pelo `capture.sql.review`/helper temporário. Não sanitizar corpos. `assemble.py capture.json OUTPUT` gera PRE/INSTALL/POST/ROLLBACK/RELEASE separados. Fonte tem pins esperados da composição anterior; divergência exige revisão, jamais repin automático.
4. Auditor revisar saída e hashes. Rodar PRE, instalar fechado e POST; repetir INSTALL só após estado idêntico (não abre gate). RELEASE separado concede somente cinco RPCs ao authenticated e atesto service-only; não concede helpers privados ou DML.
5. Implantar Edge somente HML como `microorganism-documents`, `verify_jwt=true`. Montar com `../build-edge.py --ref vrlcdwmlytukrjezrrnf --service documents --out /tmp/review-documents`; binding.ts é constante, não Deno.env.set. Variáveis: `SUPABASE_URL` HML, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` **somente servidor**. Nenhuma chave de IA/provedor é exigida. `LOVABLE_API_KEY` relatada pelo root para IA é independente destes anexos.
6. Provar upload/consulta/replay/versão/isolamento/revogação com JWT reais A/B e navegador local HML. Rollback fecha gate/EXECUTE, conserva objetos/versões/recibos/policy; nunca regrant automático.

### Preparação revisável PRODUÇÃO, sem executar
- Ref único `swzpzcwiasxmjutrmvkm`; nenhuma conexão neste complemento. O assembler aceita exatamente produção ou HML, nunca default aberto.
- Ordem obrigatória de composição: **baseline12a580416 → documentosd7dc4def → correção segurança c2db19524**. Na HML, duas primeiras etapas já aplicadas conforme relato. Na produção, observar estado real antes de cada etapa, não transplantar captura HML.
- Gerar texto de captura: `python3 documents/build-capture.py --ref swzpzcwiasxmjutrmvkm --out /tmp/prod-doc-capture.sql.review` (a partir do diretório pai). Esse comando não executa SQL. O conector deve comprovar o ref independentemente antes da futura leitura; helper temporário na mesma sessão. Capturar depois de baseline e bucket privado, antes de documentos/correção.
- `python3 documents/assemble.py /tmp/prod-doc-capture.json /tmp/prod-doc-review` exige definições integrais, MD5 original, owner/ACL, fingerprints de relações e bucket10MiB. A saída inclui digest da captura e binding explícito em binding.json. Captura ausente, acentos corrompidos, CRLF no corpo ou fundamento divergente abortam, sem repinar.
- `python3 build-edge.py --ref swzpzcwiasxmjutrmvkm --service documents --out /tmp/prod-doc-edge`; para IA usar `--service documentary`. binding.ts const por ambiente, SUPABASE_URL deve coincidir exatamente. Montagens concretas revisáveis dos dois refs estão em `../release-final/edges/`; sem secrets ou deploy.
- Captura inicial da produção ainda não foi executada; por isso **não há PRE/POST específico de produção fabricado**. As fontes e montadores estão completos, mas SQL de ambiente só deve ser gerado a partir da captura exata revisada.
- Após documentos, capturar novamente as funções read/save antes da correção segurança: PRE deve corresponder aos pins antigos revisados, POST aos novos definidos; não instalar correção antes de documentos para acomodar pins. Não reexecutar PRE/release de documentos depois de alterar save pela correção; usar captures/checks adequados à etapa instalada.
- Rollback em ordem inversa: correção fecha EXECUTE read/save, documentos fecha gate/RPCs preservando objetos/versões/recibos/policies, baseline fecha seus gates. Não restaurar read_prefs/URLs inseguras, não apagar histórico, não regrant automático. Uma reabertura exige revisão explícita da composição final.
- Publicação hosting, aplicação em produção, aprovações fiscais/técnicas e operações seguintes continuam proibidas neste complemento.

## Evidência e limites
Os pins fornecidos pelo root e os 7 checks Auth/PDF reais HML são **relato externo**, não execução deste agente. O delta não requer DSN para preparação. Provas adicionais não relatadas permanecem gates próprios, não invalidam o PASS informado nem são presumidas executadas. Acesso service-only é estritamente transporte/atesto de bytes, nunca ator de negócio.
