#!/usr/bin/env node

/**
 * Script para obter detalhes de conexão de um projeto Neon existente
 */

import fetch from 'node-fetch';

const NEON_API_TOKEN = process.env.NEON_API_TOKEN;
const PROJECT_ID = "purple-hall-01932140"; // ID do projeto criado

if (!NEON_API_TOKEN) {
  console.error('❌ NEON_API_TOKEN é obrigatório');
  process.exit(1);
}

const NEON_API_BASE = 'https://console.neon.tech/api/v2';

async function getNeonConnection() {
  try {
    console.log('🔌 Obtendo detalhes de conexão do projeto Neon...\n');

    // 1. Obter informações do projeto
    console.log('📋 Obtendo informações do projeto...');
    const projectResponse = await fetch(`${NEON_API_BASE}/projects/${PROJECT_ID}`, {
      headers: {
        'Authorization': `Bearer ${NEON_API_TOKEN}`,
      }
    });

    if (!projectResponse.ok) {
      const error = await projectResponse.text();
      throw new Error(`Erro ao obter projeto: ${error}`);
    }

    const project = await projectResponse.json();
    console.log('✅ Projeto encontrado:', project.project.name);
    console.log('🆔 Project ID:', project.project.id);

    // 2. Obter branches
    console.log('\n🌿 Obtendo branches...');
    const branchesResponse = await fetch(`${NEON_API_BASE}/projects/${PROJECT_ID}/branches`, {
      headers: {
        'Authorization': `Bearer ${NEON_API_TOKEN}`,
      }
    });

    if (!branchesResponse.ok) {
      const error = await branchesResponse.text();
      throw new Error(`Erro ao obter branches: ${error}`);
    }

    const branches = await branchesResponse.json();
    const mainBranch = branches.branches.find(b => b.name === 'main') || branches.branches[0];
    console.log('✅ Branch encontrada:', mainBranch.name);

    // 3. Obter informações de conexão via endpoints
    console.log('\n🔌 Obtendo informações de conexão...');
    const connectionResponse = await fetch(`${NEON_API_BASE}/projects/${PROJECT_ID}/branches/${mainBranch.id}/endpoints`, {
      headers: {
        'Authorization': `Bearer ${NEON_API_TOKEN}`,
      }
    });

    if (!connectionResponse.ok) {
      const error = await connectionResponse.text();
      throw new Error(`Erro ao obter endpoints: ${error}`);
    }

    const connection = await connectionResponse.json();
    const endpoint = connection.endpoints[0]; // Primeiro endpoint
    
    if (!endpoint) {
      throw new Error('Nenhum endpoint encontrado');
    }

    // 4. Gerar string de conexão
    const connectionString = `postgresql://${endpoint.user}:${endpoint.password}@${endpoint.host}/${endpoint.database_name}?sslmode=require`;

    console.log('✅ String de conexão gerada');
    console.log('\n📋 Configuração do Projeto Neon:');
    console.log('='.repeat(60));
    console.log(`🌐 Console: https://console.neon.tech/app/projects/${project.project.id}`);
    console.log(`🆔 Project ID: ${project.project.id}`);
    console.log(`🌿 Branch: ${mainBranch.name}`);
    console.log(`🔌 Host: ${endpoint.host}`);
    console.log(`📊 Database: ${endpoint.database_name}`);
    console.log(`👤 User: ${endpoint.user}`);
    console.log(`🔑 Password: ${endpoint.password}`);
    console.log('='.repeat(60));

    // 5. Criar arquivo de configuração
    const configContent = `# Neon Database Configuration
# Projeto: ${project.project.name}

export NEON_DATABASE_URL="${connectionString}"
export NEON_PROJECT_ID="${project.project.id}"
export NEON_BRANCH_ID="${mainBranch.id}"
export NEON_HOST="${endpoint.host}"
export NEON_DATABASE="${endpoint.database_name}"
export NEON_USER="${endpoint.user}"
export NEON_PASSWORD="${endpoint.password}"

# Para usar no script de migração:
# export NEON_DATABASE_URL="${connectionString}"
`;

    const fs = await import('fs');
    fs.writeFileSync('.env.neon.project', configContent);
    
    console.log('\n📝 Arquivo .env.neon.project criado com as configurações');
    
    console.log('\n🎉 Configuração obtida com sucesso!');
    console.log('\n📋 Próximos passos:');
    console.log('1. Configure a variável de ambiente:');
    console.log(`   export NEON_DATABASE_URL="${connectionString}"`);
    console.log('2. Execute a migração:');
    console.log('   node scripts/migrate-to-neon.js');
    console.log('\n🔗 Acesse o console: https://console.neon.tech/app/projects/' + project.project.id);

    // Retornar a string de conexão para uso em outros scripts
    return connectionString;

  } catch (error) {
    console.error('💥 Erro ao obter configuração Neon:', error.message);
    process.exit(1);
  }
}

// Executar
getNeonConnection().catch(console.error);