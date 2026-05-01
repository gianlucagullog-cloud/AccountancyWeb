-- ══ MIGRATION — esegui in Supabase → SQL Editor ══════════════════════════════

-- 1. Aggiungi colonne per file allegati
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS file_path TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS file_name TEXT;

-- 2. Crea bucket Storage (se non esiste già)
INSERT INTO storage.buckets (id, name, public)
VALUES ('invoice-files', 'invoice-files', false)
ON CONFLICT (id) DO NOTHING;

-- 3. Policy Storage: ogni utente accede solo ai propri file
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'user files only' AND tablename = 'objects'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY "user files only" ON storage.objects FOR ALL
      USING (
        bucket_id = 'invoice-files'
        AND auth.uid()::text = (storage.foldername(name))[1]
      )
      WITH CHECK (
        bucket_id = 'invoice-files'
        AND auth.uid()::text = (storage.foldername(name))[1]
      )
    $pol$;
  END IF;
END $$;

-- ═════════════════════════════════════════════════════════════════════════════
