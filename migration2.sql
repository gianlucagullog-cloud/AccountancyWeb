-- ============================================================
-- MIGRATION 2 — Esegui in Supabase → SQL Editor
-- ============================================================

-- 1. Tabella accesso ospiti (commercialista)
CREATE TABLE IF NOT EXISTS guest_access (
  id              BIGSERIAL PRIMARY KEY,
  admin_user_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  guest_email     TEXT NOT NULL,
  guest_user_id   UUID REFERENCES auth.users(id),
  permissions     JSONB DEFAULT '{
    "sections":{"carica":false,"registro":true,"summary":true,"settings":false},
    "actions":{"download":true,"delete":false,"edit":false,"export":true,"import":false},
    "period_from":null,
    "period_to":null
  }',
  active          BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE guest_access ENABLE ROW LEVEL SECURITY;

-- Admin vede e gestisce i propri ospiti
CREATE POLICY "guest_access: admin manages" ON guest_access
  FOR ALL USING (auth.uid() = admin_user_id)
  WITH CHECK (auth.uid() = admin_user_id);

-- Ospite vede il proprio record
CREATE POLICY "guest_access: guest reads own" ON guest_access
  FOR SELECT USING (auth.uid() = guest_user_id);

-- 2. Policy invoices: ospite puo leggere i dati dell'admin
CREATE POLICY "invoices: guest read" ON invoices
  FOR SELECT USING (
    user_id IN (
      SELECT admin_user_id FROM guest_access
      WHERE guest_user_id = auth.uid() AND active = true
    )
  );

-- 3. Policy profile: ospite puo leggere il profilo dell'admin
CREATE POLICY "profile: guest read" ON profile
  FOR SELECT USING (
    user_id IN (
      SELECT admin_user_id FROM guest_access
      WHERE guest_user_id = auth.uid() AND active = true
    )
  );

-- ============================================================
