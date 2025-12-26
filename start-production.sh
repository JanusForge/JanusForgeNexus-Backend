#!/bin/bash
echo "🚀 Starting Janus Forge Nexus - Professional Tier"
echo "================================================"
echo ""
echo "🎯 Database: Render.com Pro-4gb"
echo "💰 Plan: Professional ($19/month)"
echo "🔌 Connections: 103 max, 60s timeouts"
echo ""

# Clear any wrong environment variables
unset DATABASE_URL 2>/dev/null

# Start the server
node server-force-correct.js
