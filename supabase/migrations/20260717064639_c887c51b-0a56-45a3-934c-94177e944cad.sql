
ALTER TABLE public.clone_jobs
  ADD COLUMN IF NOT EXISTS files_path text,
  ADD COLUMN IF NOT EXISTS refined_path text,
  ADD COLUMN IF NOT EXISTS refined_status text,
  ADD COLUMN IF NOT EXISTS refined_error text,
  ADD COLUMN IF NOT EXISTS refined_brief text,
  ADD COLUMN IF NOT EXISTS refined_at timestamptz;

-- RLS on storage.objects for the clone-artifacts bucket, scoped by user_id in path prefix
CREATE POLICY "Users read own clone artifacts"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'clone-artifacts' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users write own clone artifacts"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'clone-artifacts' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users update own clone artifacts"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'clone-artifacts' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users delete own clone artifacts"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'clone-artifacts' AND (storage.foldername(name))[1] = auth.uid()::text);
