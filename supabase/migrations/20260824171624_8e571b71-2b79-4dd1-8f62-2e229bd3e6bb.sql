ALTER TABLE public.app_settings DROP CONSTRAINT IF EXISTS app_settings_allowed_keys;
ALTER TABLE public.app_settings ADD CONSTRAINT app_settings_allowed_keys CHECK (key IN ('is_paused','room_order'));

ALTER TABLE public.app_settings DROP CONSTRAINT IF EXISTS app_settings_valid_value;
ALTER TABLE public.app_settings ADD CONSTRAINT app_settings_valid_value CHECK (
  (key = 'is_paused' AND jsonb_typeof(value) = 'boolean')
  OR (key = 'room_order' AND jsonb_typeof(value) = 'array' AND jsonb_array_length(value) = 5)
);

DROP POLICY IF EXISTS app_settings_pause_insert ON public.app_settings;
DROP POLICY IF EXISTS app_settings_pause_update ON public.app_settings;

CREATE POLICY app_settings_allowed_insert
ON public.app_settings
FOR INSERT
TO anon, authenticated
WITH CHECK (
  (key = 'is_paused' AND jsonb_typeof(value) = 'boolean')
  OR (
    key = 'room_order'
    AND jsonb_typeof(value) = 'array'
    AND jsonb_array_length(value) = 5
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(value) e
      WHERE jsonb_typeof(e) <> 'number'
        OR (e)::int NOT IN (6,7,8,9,10)
    )
    AND (SELECT count(DISTINCT e::text) FROM jsonb_array_elements(value) e) = 5
  )
);

CREATE POLICY app_settings_allowed_update
ON public.app_settings
FOR UPDATE
TO anon, authenticated
USING (key IN ('is_paused', 'room_order'))
WITH CHECK (
  (key = 'is_paused' AND jsonb_typeof(value) = 'boolean')
  OR (
    key = 'room_order'
    AND jsonb_typeof(value) = 'array'
    AND jsonb_array_length(value) = 5
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(value) e
      WHERE jsonb_typeof(e) <> 'number'
        OR (e)::int NOT IN (6,7,8,9,10)
    )
    AND (SELECT count(DISTINCT e::text) FROM jsonb_array_elements(value) e) = 5
  )
);

INSERT INTO public.app_settings (key, value)
VALUES ('room_order', '[6,7,8,9,10]'::jsonb)
ON CONFLICT (key) DO NOTHING;