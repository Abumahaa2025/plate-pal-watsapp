
CREATE TABLE public.plate_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  name TEXT NOT NULL,
  plates JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.plate_batches TO authenticated;
GRANT ALL ON public.plate_batches TO service_role;
ALTER TABLE public.plate_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_batches" ON public.plate_batches FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX plate_batches_user_idx ON public.plate_batches(user_id, created_at DESC);
