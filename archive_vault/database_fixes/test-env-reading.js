console.log('🔍 Testing what Node.js ACTUALLY reads...');
console.log('Current directory:', process.cwd());

// Try different ways to load .env
require('dotenv').config();

console.log('\nFrom process.env:');
console.log('DATABASE_URL exists:', !!process.env.DATABASE_URL);

if (process.env.DATABASE_URL) {
  const url = process.env.DATABASE_URL;
  console.log('First 100 chars:', url.substring(0, 100) + '...');
  console.log('Contains dpg-d56p1bbuibrs739ojang-a?', url.includes('dpg-d56p1bbuibrs739ojang-a'));
  console.log('Contains dpg-d4e96nuuk2gs739dfk0g-a?', url.includes('dpg-d4e96nuuk2gs739dfk0g-a'));
  console.log('Contains janusforge_db_user?', url.includes('janusforge_db_user'));
  console.log('Contains janusforge?', url.includes('janusforge'));
}

// Also try reading file directly
const fs = require('fs');
console.log('\n📄 Reading .env file directly:');
try {
  const envContent = fs.readFileSync('.env', 'utf8');
  console.log('File exists, size:', envContent.length, 'chars');
  
  const dbLine = envContent.split('\n').find(line => line.includes('DATABASE_URL'));
  if (dbLine) {
    console.log('DATABASE_URL line:', dbLine.substring(0, 100) + '...');
  }
} catch (error) {
  console.log('Cannot read .env file:', error.message);
}
