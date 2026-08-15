-- Create cleaning_logs table
CREATE TABLE public.cleaning_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_number INTEGER NOT NULL CHECK (room_number IN (6, 7, 8, 9, 10)),
    completed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    status TEXT DEFAULT 'concluido' NOT NULL
);

-- Grant access to authenticated and anon (since it's a no-login app)
GRANT SELECT, INSERT ON public.cleaning_logs TO anon;
GRANT SELECT, INSERT ON public.cleaning_logs TO authenticated;
GRANT ALL ON public.cleaning_logs TO service_role;

-- Enable RLS
ALTER TABLE public.cleaning_logs ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can read logs
CREATE POLICY "Allow public read access"
ON public.cleaning_logs
FOR SELECT
TO anon, authenticated
USING (true);

-- Policy: Anyone can insert logs (no login required as requested)
CREATE POLICY "Allow public insert access"
ON public.cleaning_logs
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

-- Enable Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.cleaning_logs;
