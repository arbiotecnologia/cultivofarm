-- APLICADO externamente pelo Codex no canônico swzpzcwiasxmjutrmvkm
-- migration global_culturas_client_write_containment. NÃO REAPLICAR.
-- Leitura preservada; nenhum dado excluído. Rollback NÃO deve restaurar estes grants.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.culturas FROM PUBLIC, anon, authenticated;
