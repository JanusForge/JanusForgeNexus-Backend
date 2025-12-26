// Direct test script to verify backend connection
const API_BASE_URL = 'http://localhost:5000/api';

async function testEndpoint(name, endpoint, method = 'GET', body = null) {
  try {
    console.log(`🧪 Testing: ${name}...`);
    
    const options = {
      method,
      headers: { 'Content-Type': 'application/json' }
    };
    
    if (body) {
      options.body = JSON.stringify(body);
    }
    
    const response = await fetch(`${API_BASE_URL}${endpoint}`, options);
    const data = await response.json();
    
    if (response.ok && data.success !== false) {
      console.log(`✅ ${name}: SUCCESS`);
      if (data.tiers) console.log(`   Tiers: ${data.tiers.length} loaded`);
      if (data.conversations) console.log(`   Conversations: ${data.conversations.length} loaded`);
      if (data.topic) console.log(`   Topic: ${data.topic.title.substring(0, 50)}...`);
      return true;
    } else {
      console.log(`❌ ${name}: ${data.error || 'Failed'}`);
      return false;
    }
  } catch (error) {
    console.log(`❌ ${name}: ${error.message}`);
    return false;
  }
}

async function runTests() {
  console.log('🚀 Testing Janus Forge Backend Connection\n');
  
  const results = await Promise.all([
    testEndpoint('Health Check', '/health'),
    testEndpoint('Tiers', '/tiers'),
    testEndpoint('Conversations', '/conversations'),
    testEndpoint('Daily Forge', '/daily-forge/current'),
    testEndpoint('Registration', '/auth/register', 'POST', {
      email: `test_${Date.now()}@janusforge.ai`,
      username: `testuser_${Date.now()}`,
      password: 'Test123!'
    })
  ]);
  
  const passed = results.filter(r => r).length;
  const total = results.length;
  
  console.log(`\n📊 Results: ${passed}/${total} tests passed`);
  
  if (passed === total) {
    console.log('\n🎉 BACKEND IS FULLY CONNECTED AND WORKING!');
    console.log('Your React app can now connect to: http://localhost:5000');
  } else {
    console.log('\n⚠️  Some tests failed. Check backend is running.');
    console.log('Run: cd ~/JanusForgeNexus-Backend && node server-fixed.js');
  }
}

runTests().catch(console.error);
