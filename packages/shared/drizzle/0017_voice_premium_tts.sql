-- Voice premium TTS feature flags
INSERT INTO admin_feature_flags (key, value, description, category) VALUES
  ('voice.premium_tts_enabled', 'false', 'Enable premium cloud TTS voices (Azure Speech)', 'voice'),
  ('voice.azure_speech_key', '""', 'Azure Speech Services subscription key', 'voice'),
  ('voice.azure_speech_region', '"centralindia"', 'Azure Speech Services region', 'voice'),
  ('voice.azure_speech_voices', '["en-IN-NeerjaNeural","en-IN-PrabhatNeural"]', 'Available Azure TTS voice IDs', 'voice'),
  ('voice.monthly_char_limit', '500000', 'Platform-wide monthly character limit for premium TTS', 'voice'),
  ('voice.per_user_char_limit', '10000', 'Per-user monthly character limit for premium TTS', 'voice')
ON CONFLICT (key) DO NOTHING;

-- TTS usage tracking
CREATE TABLE IF NOT EXISTS "tts_usage_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "provider" varchar(30) NOT NULL,
  "voice_id" varchar(100) NOT NULL,
  "char_count" integer NOT NULL,
  "estimated_cost_usd" real DEFAULT 0,
  "session_id" uuid REFERENCES "voice_sessions"("id"),
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_tts_usage_user_month" ON "tts_usage_logs" ("user_id", "provider", "created_at");
