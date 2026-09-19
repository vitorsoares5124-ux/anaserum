-- Migração: parcelamento por produto (qtd + valor)
-- Rode no Supabase: Dashboard -> SQL Editor -> New query -> colar -> Run
ALTER TABLE produtos
  ADD COLUMN IF NOT EXISTS parcelas INTEGER NOT NULL DEFAULT 6,
  ADD COLUMN IF NOT EXISTS parcela_valor TEXT NOT NULL DEFAULT '';

-- Garante limite 1..12
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'produtos_parcelas_check') THEN
    ALTER TABLE produtos ADD CONSTRAINT produtos_parcelas_check CHECK (parcelas >= 1 AND parcelas <= 12);
  END IF;
END $$;

-- Opcional: recalcula valor das parcelas antigas (preço ÷ qtd) onde estiver vazio
-- (rode só se quiser preencher os 4 produtos atuais automaticamente)
-- UPDATE produtos SET parcela_valor = '' WHERE parcela_valor IS NULL;
