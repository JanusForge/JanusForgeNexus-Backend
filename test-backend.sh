#!/bin/bash

echo "🔧 Testing Janus Forge Nexus Backend Setup"
echo "=========================================="

# Check if Node modules are installed
if [ ! -d "node_modules" ]; then
    echo "❌ Node modules not found. Installing..."
    npm install
else
    echo "✅ Node modules installed"
fi

# Check TypeScript compilation
echo "🔍 Checking TypeScript compilation..."
npx tsc --noEmit
if [ $? -eq 0 ]; then
    echo "✅ TypeScript compilation successful"
else
    echo "❌ TypeScript compilation failed"
    exit 1
fi

# Generate Prisma client
echo "🔧 Generating Prisma client..."
npx prisma generate
if [ $? -eq 0 ]; then
    echo "✅ Prisma client generated"
else
    echo "❌ Prisma client generation failed"
    exit 1
fi

# Check environment variables
echo "🔍 Checking environment variables..."
if [ -f ".env" ]; then
    echo "✅ .env file exists"
    if grep -q "DATABASE_URL" .env && grep -q "JWT_ACCESS_SECRET" .env; then
        echo "✅ Required environment variables found"
    else
        echo "⚠️  Missing some environment variables"
        echo "   Please ensure DATABASE_URL and JWT secrets are set"
    fi
else
    echo "❌ .env file not found"
    cp .env.example .env 2>/dev/null || echo "⚠️  No .env.example found"
fi

echo ""
echo "🚀 Setup Complete!"
echo "=================="
echo "To start the backend:"
echo "1. Set up PostgreSQL database"
echo "2. Update DATABASE_URL in .env"
echo "3. Run: npm run dev"
echo ""
echo "📡 Default API endpoints:"
echo "   • Health: http://localhost:5000/api/health"
echo "   • Register: POST http://localhost:5000/api/auth/register"
echo "   • Login: POST http://localhost:5000/api/auth/login"
echo ""
echo "💡 Quick database setup for development:"
echo "   Install PostgreSQL, then run:"
echo "   createdb janusforgedb"
echo "   npm run prisma:migrate"
