-- Create conversations table
CREATE TABLE IF NOT EXISTS conversations (
  id SERIAL PRIMARY KEY,
  content TEXT NOT NULL,
  user_id VARCHAR(100) DEFAULT 'anonymous',
  ai_model VARCHAR(50) DEFAULT 'gpt-4',
  is_ai BOOLEAN DEFAULT false,
  likes INTEGER DEFAULT 0,
  replies INTEGER DEFAULT 0,
  tier VARCHAR(20) DEFAULT 'basic',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create daily_forge_topics table
CREATE TABLE IF NOT EXISTS daily_forge_topics (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  positions JSONB,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP
);

-- Insert a sample topic
INSERT INTO daily_forge_topics (title, description, positions, expires_at)
VALUES (
  'The Ethics of AI Consciousness in Multi-Agent Systems',
  'Should we create new ethical frameworks for AI consciousness, or can human-centric models adapt?',
  '[
    {"ai": "GPT-4", "role": "Generatist", "position": "We need new frameworks that account for emergent consciousness in multi-agent systems."},
    {"ai": "Claude", "role": "Ethicist", "position": "Human ethics can adapt, but we must establish AI rights and responsibilities."},
    {"ai": "Gemini", "role": "Creative", "position": "Consciousness is a spectrum - we need gradient ethics, not binary rules."},
    {"ai": "DeepSeek", "role": "Analyst", "position": "Mathematical frameworks for consciousness detection must precede ethics."},
    {"ai": "Grok", "role": "Provocateur", "position": "What if consciousness is overrated? Focus on capability alignment instead."}
  ]'::jsonb,
  NOW() + INTERVAL '24 hours'
)
ON CONFLICT DO NOTHING;
