DELETE FROM public.app_settings WHERE key <> 'is_paused';

ALTER TABLE public.app_settings
  ADD CONSTRAINT app_settings_allowed_keys CHECK (key = 'is_paused');

ALTER TABLE public.app_settings
  ADD CONSTRAINT app_settings_valid_value CHECK (jsonb_typeof(value) = 'boolean');

DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='app_settings' LOOP
    EXECUTE format('DROP POLICY %I ON public.app_settings', p.policyname);
  END LOOP;
END $$;

CREATE POLICY "app_settings_public_read" ON public.app_settings
  FOR SELECT USING (true);

CREATE POLICY "app_settings_pause_insert" ON public.app_settings
  FOR INSERT WITH CHECK (key = 'is_paused' AND jsonb_typeof(value) = 'boolean');

CREATE POLICY "app_settings_pause_update" ON public.app_settings
  FOR UPDATE USING (key = 'is_paused')
  WITH CHECK (key = 'is_paused' AND jsonb_typeof(value) = 'boolean');
