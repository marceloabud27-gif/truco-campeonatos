ALTER TABLE torneos
  ADD COLUMN IF NOT EXISTS puntaje_objetivo INTEGER NOT NULL DEFAULT 18;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'torneos_puntaje_objetivo_check'
  ) THEN
    ALTER TABLE torneos
      ADD CONSTRAINT torneos_puntaje_objetivo_check
      CHECK (puntaje_objetivo IN (12, 14, 16, 18));
  END IF;
END $$;
