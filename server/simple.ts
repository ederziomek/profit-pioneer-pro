import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

// Middleware básico
app.use(express.json());
app.use(express.static(path.join(__dirname, '../dist')));

// Healthcheck simples e rápido
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

app.get('/health/simple', (req, res) => {
  res.status(200).send('OK');
});

// Rota raiz
app.get('/', (req, res) => {
  res.json({ 
    message: 'Profit Pioneer Pro - Simple Server',
    status: 'running',
    timestamp: new Date().toISOString()
  });
});

// Rota catch-all para SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../dist/index.html'));
});

// Iniciar servidor
const server = app.listen(port, '0.0.0.0', () => {
  console.log('=================================');
  console.log('🚀 SERVIDOR SIMPLES INICIADO!');
  console.log('=================================');
  console.log(`📍 Porta: ${port}`);
  console.log(`🌐 Ambiente: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 Healthcheck: http://localhost:${port}/health`);
  console.log(`🔗 Healthcheck Simples: http://localhost:${port}/health/simple`);
  console.log('=================================');
}).on('error', (error) => {
  console.error('❌ ERRO AO INICIAR SERVIDOR:', error);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('Recebido SIGINT, fechando servidor...');
  server.close(() => {
    console.log('Servidor fechado');
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  console.log('Recebido SIGTERM, fechando servidor...');
  server.close(() => {
    console.log('Servidor fechado');
    process.exit(0);
  });
});