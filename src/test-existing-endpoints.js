const fetch = require('node-fetch');

async function testAllEndpoints() {
  console.log('🔍 Testing ALL backend endpoints...\n');
  
  const endpoints = [
    // Health & System
    { path: '/api/health', method: 'GET', description: 'System health check' },
    { path: '/api/test', method: 'GET', description: 'Simple test endpoint' },
    
    // Authentication
    { path: '/api/auth/register', method: 'POST', description: 'User registration' },
    { path: '/api/auth/login', method: 'POST', description: 'User login' },
    
    // Tiers
    { path: '/api/tiers', method: 'GET', description: 'Get pricing tiers' },
    
    // Conversations (check what exists)
    { path: '/api/conversations', method: 'GET', description: 'Get conversations' },
    { path: '/api/conversations', method: 'POST', description: 'Create conversation' },
    
    // Daily Forge
    { path: '/api/daily-forge', method: 'GET', description: 'Get daily forge topics' },
    { path: '/api/daily-forge/current', method: 'GET', description: 'Get current debate' },
  ];
  
  for (const endpoint of endpoints) {
    try {
      const url = `http://localhost:5000${endpoint.path}`;
      const options = {
        method: endpoint.method,
        headers: { 'Content-Type': 'application/json' }
      };
      
      if (endpoint.method === 'POST') {
        options.body = JSON.stringify({ test: true });
      }
      
      const response = await fetch(url, options);
      const status = response.status;
      
      if (status === 200 || status === 201) {
        const data = await response.json();
        console.log(`✅ ${endpoint.path} (${endpoint.method}): ${status} OK`);
        console.log(`   Returns: ${Object.keys(data).join(', ')}`);
      } else if (status === 404) {
        console.log(`❌ ${endpoint.path} (${endpoint.method}): ${status} Not Implemented`);
      } else {
        console.log(`⚠️  ${endpoint.path} (${endpoint.method}): ${status} (exists but error)`);
      }
    } catch (error) {
      console.log(`❌ ${endpoint.path} (${endpoint.method}): ${error.message}`);
    }
    console.log('');
  }
}

testAllEndpoints();
