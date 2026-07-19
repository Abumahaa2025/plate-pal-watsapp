CREATE TABLE public.plate_activity (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('import','export')),
  filename text NOT NULL,
  format text,
  count integer NOT NULL DEFAULT 0,
  batch_id uuid REFERENCES public.plate_batches(id) ON DELETE SET NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.plate_activity TO authenticated;
GRANT ALL ON public.plate_activity TO service_role;
ALTER TABLE public.plate_activity ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_activity" ON public.plate_activity FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX plate_activity_user_created_idx ON public.plate_activity(user_id, created_at DESC);