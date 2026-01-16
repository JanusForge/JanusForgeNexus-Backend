const fs = require('fs');
require('dotenv').config();

console.log('🔧 Fixing database connection...');

// Get current DATABASE_URL
const currentUrl = process.env.DATABASE_URL;
console.log('Current DATABASE_URL:', currentUrl ? '*** Configured ***' : 'Not set');

if (currentUrl) {
  // Ensure SSL parameters are included
  let newUrl = currentUrl;
  
  // Add sslmode=require if not present
  if (!newUrl.includes('sslmode=')) {
    if (newUrl.includes('?')) {
      newUrl += '&sslmode=require';
    } else {
      newUrl += '?sslmode=require';
    }
  }
  
  // Also add connection pool parameters for Render.com
  if (!newUrl.includes('pool_timeout=')) {
    newUrl += '&pool_timeout=0';
  }
  
  if (!newUrl.includes('connection_limit=')) {
    newUrl += '&connection_limit=5';
  }
  
  console.log('Updated DATABASE_URL:', newUrl.substring(0, 80) + '...');
  
  // Update .env file
  const envPath = '.env';
  let envContent = fs.readFileSync(envPath, 'utf8');
  envContent = envContent.replace(`DATABASE_URL=${currentUrl}`, `DATABASE_URL=${newUrl}`);
  fs.writeFileSync(envPath, envContent);
  
  console.log('✅ Updated .env file with SSL configuration');
  
  // Also create a Prisma client with explicit SSL
  const prismaConfig = `datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
  directUrl = env("DATABASE_URL")
}`;
  
  fs.writeFileSync('prisma-db-config.txt', prismaConfig);
  console.log('✅ Created Prisma connection configuration');
  
} else {
  console.log('❌ DATABASE_URL not found in .env');
}
