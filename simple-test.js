const http = require('http');

const endpoints = ['/api/health', '/api/test', '/api/tiers', '/api/auth/register'];

endpoints.forEach(endpoint => {
  const req = http.request({
    hostname: 'localhost',
    port: 5000,
    path: endpoint,
    method: 'GET',
    timeout: 3000
  }, (res) => {
    console.log(`${endpoint}: ${res.statusCode}`);
  });
  
  req.on('error', () => {
    console.log(`${endpoint}: ERROR`);
  });
  
  req.end();
});
