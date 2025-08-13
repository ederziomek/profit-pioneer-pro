import http from 'http';

const port = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }
  
  // Healthcheck
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK');
    return;
  }
  
  // Healthcheck simple
  if (req.url === '/health/simple') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK');
    return;
  }
  
  // Root
  if (req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Server is running!');
    return;
  }
  
  // 404
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
});

server.listen(port, '0.0.0.0', () => {
  console.log('🚀 SERVIDOR ULTRA-BASIC INICIADO!');
  console.log(`📍 Porta: ${port}`);
  console.log(`🔗 Healthcheck: http://localhost:${port}/health`);
  console.log(`🔗 Healthcheck Simple: http://localhost:${port}/health/simple`);
  console.log(`🔗 Root: http://localhost:${port}/`);
});

server.on('error', (error) => {
  console.error('❌ ERRO:', error);
  process.exit(1);
});