# C2.1 — inactive review package

- Keep all SQL and frontend patches inactive until independent review; this slice implements administrative lifecycle, not runtime multiportal activation — prevents partial readers from granting access.
- Reuse partner_users, user_roles and partner_audit_logs; keep unique user/partner and user/role constraints, existing guards and the applied b2b_actor_scope definition unchanged — preserves identity and containment.
- External management and consulting map to parceiro_b2b/parceiro_b2b_tecnico, never internal gestor/consultor_tecnico — prevents unrestricted internal capabilities.
- Receipts use the existing immutable partner audit log with actor/key/payload fingerprint; acquire the existing user gate before row locks, validate before and after locks, and replay before mutable validation — prevents deadlocks, stale authority and duplicate effects.
- Local PostgreSQL tests use synthetic Auth and reduced schema; hosted JWT/RLS, full trigger integration and portal activation remain unverified — prevents false certification.