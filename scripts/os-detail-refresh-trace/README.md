# Detalhe da OS — atualização da lista e rastreabilidade canônica (baseline 95fdfc8b)
Somente frontend; sem SQL, ACL, publicação ou operação hosted.
- Após sucesso confirmado (success=true e status esperado) e com o escopo ainda vigente, o diálogo chama o leitor já existente da lista (`fetchAll`, com versão anti-resposta-tardia). Erro, status divergente ou troca de escopo não atualizam.
- A aba Rastreabilidade deixou de ler view/tabelas diretas e usa apenas `rpc_cockpit_listar_esteira_v1` via `useCockpitQuery` (cache por sessão/tenant/época, fences existentes). Mostra status da OS, etapa, data programada, lote, volume e responsável quando a RPC devolve; demais etapas declaradas indisponíveis. OS ausente ≠ multiplicidade; duplicidade do mesmo id falha fechada.
- Testes: transporte/Auth fake — não é homologação real. Rollback: bytes `rollback/*.review` do commit 95fdfc8b (SHA256SUMS).
