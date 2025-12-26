const http = require('http');

const endpoints = [
  { path: '/api/health', method: 'GET', name: 'Health' },
  { path: '/api/test', method: 'GET', name: 'Test' },
  { path: '/api/tiers', method: 'GET', name: 'Tiers' },
  { path: '/api/conversations', method: 'GET', name: 'Conversations' },
  { path: '/api/daily-forge/topics', method: 'GET', name: 'Daily Forge Topics' },
  { path: '/api/daily-forge/current', method: 'GET', name: 'Current Debate' }
];

console.log('🔍 Testing ALL endpoints on server-simple.js...\n');

let passed = 0;
let failed = 0;

async function testEndpoint(endpoint) {
  return new Promise((resolve) => {
    const req = http.request({
      hostname: 'localhost',
      port: 5000,
      path: endpoint.path,
      method: endpoint.method,
      timeout: 5000
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const jsonData = JSON.parse(data);
          if (res.statusCode === 200 && jsonData.success !== false) {
            console.log(`✅ ${endpoint.name} (${endpoint.path}): ${res.statusCode} OK`);
            passed++;
          } else {
            console.log(`❌ ${endpoint.name} (${endpoint.path}): ${res.statusCode} - ${jsonData.error || 'Error'}`);
            failed++;
          }
        } catch (e) {
          console.log(`❌ ${endpoint.name} (${endpoint.path}): ${res.statusCode} - Invalid JSON`);
          failed++;
        }
        resolve();
      });
    });
    
    req.on('error', (err) => {
      console.log(`❌ ${endpoint.name} (${endpoint.path}): ${err.message}`);
      failed++;
      resolve();
    });
    
    req.on('timeout', () => {
      console.log(`❌ ${endpoint.name} (${endpoint.path}): Timeout`);
      failed++;
      req.destroy();
      resolve();
    });
    
    req.end();
  });
}

async function runAllTests() {
  for (const endpoint of endpoints) {
    await testEndpoint(endpoint);
  }
  
  console.log('\n' + '='.repeat(50));
  console.log(`📊 RESULTS: ${passed} passed, ${failed} failed`);
  console.log('='.repeat(50));
  
  if (failed === 0) {
    console.log('\n🎉 ALL ENDPOINTS WORKING! Ready for frontend integration!');
    console.log('🔗 Frontend should connect to: http://localhost:5000');
  } else {
    console.log('\n⚠️  Some endpoints failed. Check server logs.');
  }
}

runAllTests();
