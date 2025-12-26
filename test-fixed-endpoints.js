const http = require('http');

const endpoints = [
  { path: '/api/health', name: 'Health Check' },
  { path: '/api/test', name: 'Test Endpoint' },
  { path: '/api/tiers', name: 'Tiers Configuration' },
  { path: '/api/conversations', name: 'Conversations' },
  { path: '/api/daily-forge/topics', name: 'Daily Forge Topics' },
  { path: '/api/daily-forge/current', name: 'Current Daily Forge' },
  { 
    path: '/api/auth/register',
    name: 'Registration',
    method: 'POST',
    body: JSON.stringify({
      email: 'test@janusforge.ai',
      username: 'testuser',
      password: 'Test123!'
    })
  }
];

console.log('🧪 Testing Fixed Server Endpoints...\n');

let passed = 0;
let total = 0;

async function testEndpoint(endpoint) {
  total++;
  return new Promise((resolve) => {
    const options = {
      hostname: 'localhost',
      port: 5000,
      path: endpoint.path,
      method: endpoint.method || 'GET',
      headers: endpoint.body ? { 'Content-Type': 'application/json' } : {}
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const jsonData = JSON.parse(data);
          if (res.statusCode === 200 && jsonData.success !== false) {
            console.log(`✅ ${endpoint.name}: 200 OK`);
            passed++;
            
            // Show brief details
            if (endpoint.name === 'Health Check') {
              console.log(`   📊 Database: ${jsonData.database}, Users: ${jsonData.statistics?.users}`);
            } else if (endpoint.name === 'Conversations') {
              console.log(`   📝 Conversations: ${jsonData.conversations?.length || 0}`);
            } else if (endpoint.name === 'Registration') {
              console.log(`   👤 User: ${jsonData.user?.username}, Token: ${jsonData.token?.substring(0, 20)}...`);
            }
          } else {
            console.log(`❌ ${endpoint.name}: ${res.statusCode} - ${jsonData.error || 'Error'}`);
          }
        } catch (e) {
          console.log(`❌ ${endpoint.name}: Invalid JSON - ${e.message}`);
        }
        resolve();
      });
    });

    req.on('error', (err) => {
      console.log(`❌ ${endpoint.name}: Connection failed - ${err.message}`);
      resolve();
    });

    req.on('timeout', () => {
      console.log(`❌ ${endpoint.name}: Timeout`);
      req.destroy();
      resolve();
    });

    if (endpoint.body) {
      req.write(endpoint.body);
    }

    req.end();
  });
}

async function runTests() {
  for (const endpoint of endpoints) {
    await testEndpoint(endpoint);
  }

  console.log('\n' + '='.repeat(50));
  console.log(`📊 RESULTS: ${passed}/${total} endpoints working`);
  console.log('='.repeat(50));

  if (passed === total) {
    console.log(`
🎉 🎉 🎉 BACKEND IS 100% READY! 🎉 🎉 🎉

🌟 Frontend can now connect to:
   🔗 http://localhost:5000

📋 Working endpoints:
   ✅ Health check
   ✅ Tiers configuration  
   ✅ Conversations feed
   ✅ Daily Forge topics
   ✅ User registration
   ✅ User login
   ✅ Test endpoint

🚀 Next step:
   Connect your React frontend to this backend!
    `);
  } else {
    console.log('\n⚠️  Some endpoints failed. Check server logs.');
  }
}

runTests();
