import express from 'express';

const app = express();
const port = process.env.PORT || 3000;

// Healthcheck ultra-simples
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

app.get('/health/simple', (req, res) => {
  res.status(200).send('OK');
});

app.get('/', (req, res) => {
  res.send('Server is running!');
});

// Iniciar servidor
app.listen(port, '0.0.0.0', () => {
  console.log('🚀 SERVIDOR BASIC JS INICIADO!');
  console.log(`📍 Porta: ${port}`);
  console.log(`🔗 Healthcheck: http://localhost:${port}/health`);
  console.log(`🔗 Healthcheck Simple: http://localhost:${port}/health/simple`);
  console.log(`🔗 Root: http://localhost:${port}/`);
}).on('error', (error) => {
  console.error('❌ ERRO:', error);
  process.exit(1);
});