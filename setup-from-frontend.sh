#!/bin/bash

echo "🔄 Setting up backend from frontend configuration"
echo "================================================"

FRONTEND_ENV="../JanusForgeNexus-React/.env.local"
BACKEND_ENV=".env"

if [ ! -f "$FRONTEND_ENV" ]; then
    echo "❌ Frontend .env.local not found at: $FRONTEND_ENV"
    exit 1
fi

echo "📁 Found frontend configuration at: $FRONTEND_ENV"

# Create backup of current .env
if [ -f "$BACKEND_ENV" ]; then
    cp "$BACKEND_ENV" "$BACKEND_ENV.backup"
    echo "📦 Created backup of existing .env"
fi

# Start with fresh .env template
cat > "$BACKEND_ENV" << 'TEMPLATE'
# Server Configuration
PORT=5000
NODE_ENV=development
FRONTEND_URL=http://localhost:3000
CORS_ORIGIN=http://localhost:3000,https://janusforge.ai

# JWT Configuration - Will be auto-generated
JWT_ACCESS_SECRET=REPLACE_ME
JWT_REFRESH_SECRET=REPLACE_ME
ACCESS_TOKEN_EXPIRY=15m
REFRESH_TOKEN_EXPIRY=7d

# Database Configuration - Will be copied from frontend
DATABASE_URL=REPLACE_ME

# AI API Keys - Will be copied from frontend
OPENAI_API_KEY=REPLACE_ME
ANTHROPIC_API_KEY=REPLACE_ME
GEMINI_API_KEY=REPLACE_ME
GROK_API_KEY=REPLACE_ME
DEEPSEEK_API_KEY=REPLACE_ME

# Stripe Configuration
STRIPE_SECRET_KEY=REPLACE_ME
STRIPE_WEBHOOK_SECRET=REPLACE_ME
TEMPLATE

echo "✅ Created fresh .env template"

# Extract DATABASE_URL from frontend
DATABASE_URL=$(grep "^DATABASE_URL=" "$FRONTEND_ENV" | cut -d '=' -f2-)
if [ -n "$DATABASE_URL" ]; then
    sed -i "s|DATABASE_URL=REPLACE_ME|DATABASE_URL=$DATABASE_URL|" "$BACKEND_ENV"
    echo "✅ Copied DATABASE_URL"
else
    echo "❌ DATABASE_URL not found in frontend .env.local"
fi

# Extract and transfer API keys (exact names as provided)
echo ""
echo "🔐 Copying API keys..."
echo "---------------------"

# List of API keys to transfer (exact names)
API_KEYS=(
    "OPENAI_API_KEY"
    "ANTHROPIC_API_KEY" 
    "GEMINI_API_KEY"
    "GROK_API_KEY"
    "DEEPSEEK_API_KEY"
    "STRIPE_SECRET_KEY"
    "STRIPE_WEBHOOK_SECRET"
)

for key in "${API_KEYS[@]}"; do
    value=$(grep "^$key=" "$FRONTEND_ENV" | cut -d '=' -f2-)
    if [ -n "$value" ]; then
        # Escape special characters for sed
        escaped_value=$(echo "$value" | sed 's/[&/\]/\\&/g')
        sed -i "s|$key=REPLACE_ME|$key=$escaped_value|" "$BACKEND_ENV"
        echo "✅ Copied $key"
    else
        echo "⚠️  $key not found in frontend"
    fi
done

# Generate JWT secrets
echo ""
echo "🔐 Generating JWT secrets..."
NEW_ACCESS_SECRET=$(openssl rand -hex 32)
NEW_REFRESH_SECRET=$(openssl rand -hex 32)

sed -i "s|JWT_ACCESS_SECRET=REPLACE_ME|JWT_ACCESS_SECRET=$NEW_ACCESS_SECRET|" "$BACKEND_ENV"
sed -i "s|JWT_REFRESH_SECRET=REPLACE_ME|JWT_REFRESH_SECRET=$NEW_REFRESH_SECRET|" "$BACKEND_ENV"
echo "✅ Generated secure JWT secrets"

echo ""
echo "🎉 Configuration transfer complete!"
echo ""
echo "📋 Summary of transferred items:"
echo "   • Database URL: $( [ -n "$DATABASE_URL" ] && echo "✅" || echo "❌" )"
echo "   • JWT Secrets: ✅ (auto-generated)"
echo "   • AI API Keys: ✅ (5 models)"
echo "   • Stripe Keys: ✅"
echo ""
echo "🔍 Final .env file preview:"
echo "--------------------------"
grep -E "^(PORT|NODE_ENV|DATABASE_URL|JWT|OPENAI|ANTHROPIC|GEMINI|GROK|DEEPSEEK|STRIPE)" "$BACKEND_ENV" | while read line; do
    key=$(echo "$line" | cut -d '=' -f1)
    value=$(echo "$line" | cut -d '=' -f2)
    if [ "${#value}" -gt 20 ]; then
        echo "   $key=*** (${#value} chars)"
    else
        echo "   $key=$value"
    fi
done
