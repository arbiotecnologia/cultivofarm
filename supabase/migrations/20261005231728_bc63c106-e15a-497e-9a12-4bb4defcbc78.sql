UPDATE public.organization_subscriptions
SET trial_ends_at = started_at + interval '14 days',
    state_changed_at = COALESCE(state_changed_at, started_at)
WHERE status = 'TRIAL'
  AND plan_version_id IS NULL
  AND trial_ends_at IS NULL
  AND started_at IS NOT NULL;