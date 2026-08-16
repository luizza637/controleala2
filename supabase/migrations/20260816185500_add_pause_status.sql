CREATE TABLE IF NOT EXISTS public.app_settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Grant access
GRANT SELECT, INSERT, UPDATE ON public.app_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.app_settings TO anon;
GRANT ALL ON public.app_settings TO service_role;

-- Enable RLS
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Public read app_settings" ON public.app_settings FOR SELECT TO anon USING (true);
CREATE POLICY "Public update app_settings" ON public.app_settings FOR UPDATE TO anon USING (true);
CREATE POLICY "Public insert app_settings" ON public.app_settings FOR INSERT TO anon WITH CHECK (true);

-- Initial value
INSERT INTO public.app_settings (key, value)
VALUES ('is_paused', 'false'::jsonb)
ON CONFLICT (key) DO NOTHING;
