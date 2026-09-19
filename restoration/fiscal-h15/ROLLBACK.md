# H15 rollback

Before commit: ROLLBACK restores schema, functions, policies and backfill atomically.
After commit: do not remove isolation or ownership columns after invoices exist. Stop fiscal traffic, snapshot the database, verify canonical marker and counts, and obtain explicit authorization for a compensating migration. Restore function definitions and ACLs from inventory/baseline only together with the schema rollback; never restore global readers while multi-company data exists. No destructive automatic rollback is supplied.
