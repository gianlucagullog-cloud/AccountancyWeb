-- ============================================================
-- MIGRATION 3 — Trading Section
-- Esegui in Supabase → SQL Editor
-- ============================================================

-- 1. Posizioni in portafoglio
CREATE TABLE IF NOT EXISTS trading_positions (
  id            BIGSERIAL PRIMARY KEY,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ticker        TEXT NOT NULL,
  name          TEXT,
  asset_type    TEXT DEFAULT 'stock', -- stock, etf, bond, crypto, commodity, other
  quantity      NUMERIC(20,6) DEFAULT 0,
  avg_buy_price NUMERIC(14,4) DEFAULT 0,
  currency      TEXT DEFAULT 'USD',
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Storico transazioni per calcolo avg price corretto
CREATE TABLE IF NOT EXISTS trading_transactions (
  id            BIGSERIAL PRIMARY KEY,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  position_id   BIGINT REFERENCES trading_positions(id) ON DELETE CASCADE,
  type          TEXT CHECK (type IN ('buy','sell')),
  quantity      NUMERIC(20,6) NOT NULL,
  price         NUMERIC(14,4) NOT NULL,
  date          DATE NOT NULL,
  fees          NUMERIC(10,4) DEFAULT 0,
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Row Level Security
ALTER TABLE trading_positions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE trading_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "positions: own" ON trading_positions
  FOR ALL USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id);
CREATE POLICY "transactions: own" ON trading_transactions
  FOR ALL USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id);

-- Ospiti possono leggere le posizioni dell'admin
CREATE POLICY "positions: guest read" ON trading_positions
  FOR SELECT USING (
    user_id IN (
      SELECT admin_user_id FROM guest_access
      WHERE guest_user_id=auth.uid() AND active=true
    )
  );

-- ============================================================
