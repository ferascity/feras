ALTER TABLE matches ADD COLUMN IF NOT EXISTS current_eval_centipawns INTEGER;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS current_analysis JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE match_moves ADD COLUMN IF NOT EXISTS analysis JSONB NOT NULL DEFAULT '[]'::jsonb;
