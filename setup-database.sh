#!/bin/bash

echo "🗄️  Janus Forge Nexus Database Setup"
echo "==================================="

# Check if PostgreSQL is installed
if ! command -v psql &> /dev/null; then
    echo "❌ PostgreSQL is not installed. Please install PostgreSQL first."
    echo "   Ubuntu/Debian: sudo apt install postgresql postgresql-contrib"
    echo "   macOS: brew install postgresql"
    echo "   Then run: sudo -u postgres createuser --superuser \$USER"
    exit 1
fi

# Check if database exists
if psql -lqt | cut -d \| -f 1 | grep -qw janusforgedb; then
    echo "✅ Database 'janusforgedb' already exists"
else
    echo "📦 Creating database 'janusforgedb'..."
    createdb janusforgedb
    if [ $? -eq 0 ]; then
        echo "✅ Database created successfully"
    else
        echo "❌ Failed to create database"
        exit 1
    fi
fi

# Run Prisma migrations
echo "🚀 Running Prisma migrations..."
npx prisma migrate dev --name init

if [ $? -eq 0 ]; then
    echo "✅ Database migrations completed"
    
    # Generate Prisma client
    echo "🔧 Generating Prisma client..."
    npx prisma generate
    
    # Seed initial data
    echo "🌱 Seeding initial tier configurations..."
    npx ts-node seed.ts 2>/dev/null || echo "⚠️  Could not seed data (seed.ts not found)"
    
    echo ""
    echo "🎉 Database setup complete!"
    echo ""
    echo "📊 Database Info:"
    echo "   Name: janusforgedb"
    echo "   Tables: users, conversations, posts, ai_responses, etc."
    echo "   Tiers: FREE, BASIC, PROFESSIONAL, ENTERPRISE"
    echo "   AI Models: GROK, GEMINI_PRO, CLAUDE, CHATGPT, DEEPSEEK"
else
    echo "❌ Database migrations failed"
    exit 1
fi
