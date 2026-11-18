# Delta aditivo — documentos exclusivos de microrganismo

Candidato independente sobre **12a580416**. Nenhum instalador baseline foi alterado; nenhuma conexão, escrita em produção ou publicação é feita pelos scripts deste diretório.

## Contrato
- Material documental do microrganismo próprio, mesmo sem produto comercial. Não duplica dossiê de produto, não cria aprovação técnica/regulatória/fiscal.
- Admin/Gestor canônicos anexam; leitores autorizados pelo `catalog_tenant_actor('read_catalog')` consultam apenas o tenant proprietário. Globais não recebem writer nem novos anexos.
- PDF/PNG/JPEG, bytes reais e SHA-256, até **10 MiB** cada; **50 versões/reservas por microrganismo**, **500 MiB por tenant**, **20 reservas por ator/hora**, **2 pendentes simultâneas por tenant**. Reservas expiradas contam no armazenamento até manutenção revisada; não há delete automático.
- Preparar reserva com CAS observado e intenção idempotente → Edge mede/transporta bytes → atesta integridade → commit com JWT do ator e motor canônico de raiz → versão/recibo atômicos. Storage e transação SQL são separados: falha pode deixar objeto privado órfão/reserva, nunca falso rollback.
- Substituição cria versão imutável, não sobrescreve objeto. Replay usa a mesma chave, argumentos e arquivo; drift/revogação negam antes de retornar recibo.
- Consulta é POST autenticado, prova antes/depois dos bytes, `private, no-store`, sem signed URLs/GET público. Cliente valida hash/tipo/tamanho e revoga Blob ao fechar/mudar contexto.

## Instalação somente HML pelo root
1. Provar `vrlcdwmlytukrjezrrnf` pelo conector. Baseline já instalado/released pelo root conforme relato 02:49; não reaplicar. Validar o estado antes do delta.
2. Storage API: criar `microorganism-documents`, `public=false`, `file_size_limit=10MB`, tipos PDF/PNG/JPEG quando suportado. Não usar SQL para buckets.
3. Capturar funções integrais, owner/ACL, relações/guards e bucket pelo `capture.sql.review`/helper temporário. Não sanitizar corpos. `assemble.py capture.json OUTPUT` gera PRE/INSTALL/POST/ROLLBACK/RELEASE separados. Fonte tem pins esperados da composição anterior; divergência exige revisão, jamais repin automático.
4. Auditor revisar saída e hashes. Rodar PRE, instalar fechado e POST; repetir INSTALL só após estado idêntico (não abre gate). RELEASE separado concede somente cinco RPCs ao authenticated e atesto service-only; não concede helpers privados ou DML.
5. Implantar Edge somente HML como `microorganism-documents`, `verify_jwt=true`. Montar com `../build-edge.py --ref vrlcdwmlytukrjezrrnf --service documents --out /tmp/review-documents`; binding.ts é constante, não Deno.env.set. Variáveis: `SUPABASE_URL` HML, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` **somente servidor**. Nenhuma chave de IA/provedor é exigida. `LOVABLE_API_KEY` relatada pelo root para IA é independente destes anexos.
6. Provar upload/consulta/replay/versão/isolamento/revogação com JWT reais A/B e navegador local HML. Rollback fecha gate/EXECUTE, conserva objetos/versões/recibos/policy; nunca regrant automático.

## Evidência e limites
Os pins fornecidos pelo root e Auth A/B HML são **relato externo**, não execução deste agente. O delta não requer DSN para preparação. Captura exata pós-instalação baseline/bucket e provas hosted deste novo delta são entregues/executadas pelo root; não representam impedimento de implementação, mas são gate de homologação. Acesso service-only é estritamente transporte/atesto de bytes, nunca ator de negócio.
