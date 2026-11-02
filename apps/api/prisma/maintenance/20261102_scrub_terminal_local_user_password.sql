-- One-time, repeat-safe historical scrub. Execute only after aggregate preflight
-- on the intended controller database. Never SELECT or RETURN the password.
-- This corrects the sole failed local_user_create reported for 2026-08-01.
-- Previously encrypted DR snapshots require their own retention/key policy.
DO $scrub$
DECLARE
    candidates uuid[];
    changed integer := 0;
BEGIN
    SELECT array_agg(id) INTO candidates
    FROM node_commands
    WHERE type = 'local_user_create'
      AND status = 'failed'
      AND (created_at AT TIME ZONE 'America/Sao_Paulo')::date = DATE '2026-08-01'
      AND jsonb_typeof(payload_json -> 'password') = 'string'
      AND length(payload_json ->> 'password') > 0;

    IF coalesce(array_length(candidates, 1), 0) > 1 THEN
        RAISE EXCEPTION 'historical scrub stopped: more than one matching command';
    END IF;

    IF coalesce(array_length(candidates, 1), 0) = 1 THEN
        UPDATE node_commands
        SET payload_json = payload_json - 'password'
        WHERE id = candidates[1]
          AND status = 'failed'
          AND jsonb_typeof(payload_json -> 'password') = 'string';
        GET DIAGNOSTICS changed = ROW_COUNT;
        IF changed = 1 THEN
            INSERT INTO audit_logs (actor_type, action, target_type, target_id, metadata_json)
            VALUES ('system', 'security.historical_command_password_scrub',
                    'node_command', candidates[1]::text,
                    jsonb_build_object('reason', 'terminal historical cleanup',
                                       'field_removed', 'password'));
        END IF;
    END IF;

    RAISE NOTICE 'historical terminal command scrub: % record(s) updated', changed;
END
$scrub$;
