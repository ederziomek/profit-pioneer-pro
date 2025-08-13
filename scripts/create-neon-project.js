#!/usr/bin/env node

/**
 * Script para criar projeto Neon automaticamente
 * 
 * Como usar:
 * 1. Obtenha um token de API do Neon: https://console.neon.tech/account/api-keys
 * 2. Configure: export NEON_API_TOKEN="seu_token_aqui"
 * 3. Execute: node scripts/create-neon-project.js
 */

import fetch from 'node-fetch';

const NEON_API_TOKEN = process.env.NEON_API_TOKEN;

if (!NEON_API_TOKEN) {
  console.error('❌ NEON_API_TOKEN é obrigatório');
  console.log('📋 Obtenha em: https://console.neon.tech/account/api-keys');
  process.exit(1);
}

const NEON_API_BASE = 'https://console.neon.tech/api/v2';

async function createNeonProject() {
  try {
    console.log('🚀 Criando projeto Neon...\n');

    // 1. Criar projeto
    console.log('📝 Criando projeto...');
    const projectResponse = await fetch(`${NEON_API_BASE}/projects`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${NEON_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        project: {
          name: 'profit-pioneer-pro',
          region_id: 'aws-us-east-1', // Região padrão
          settings: {
            compute_provisioner: 'k8s-neon',
            default_tenant_id: 'ep-cool-forest-123456', // Será gerado automaticamente
          }
        }
      })
    });

    if (!projectResponse.ok) {
      const error = await projectResponse.text();
      throw new Error(`Erro ao criar projeto: ${error}`);
    }

    const project = await projectResponse.json();
    console.log('✅ Projeto criado:', project.project.name);
    console.log('🆔 Project ID:', project.project.id);

    // 2. Criar branch principal
    console.log('\n🌿 Criando branch principal...');
    const branchResponse = await fetch(`${NEON_API_BASE}/projects/${project.project.id}/branches`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${NEON_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        branch: {
          name: 'main',
          parent_id: project.project.default_branch_id || project.project.root_branch_id
        }
      })
    });

    if (!branchResponse.ok) {
      const error = await branchResponse.text();
      throw new Error(`Erro ao criar branch: ${error}`);
    }

    const branch = await branchResponse.json();
    console.log('✅ Branch criada:', branch.branch.name);

    // 3. Obter informações de conexão
    console.log('\n🔌 Obtendo informações de conexão...');
    const connectionResponse = await fetch(`${NEON_API_BASE}/projects/${project.project.id}/connection_details`, {
      headers: {
        'Authorization': `Bearer ${NEON_API_TOKEN}`,
      }
    });

    if (!connectionResponse.ok) {
      const error = await connectionResponse.text();
      throw new Error(`Erro ao obter detalhes de conexão: ${error}`);
    }

    const connection = await connectionResponse.json();
    const connectionDetails = connection.connection_details;

    // 4. Gerar string de conexão
    const connectionString = `postgresql://${connectionDetails.user}:${connectionDetails.password}@${connectionDetails.host}/${connectionDetails.database_name}?sslmode=require`;

    console.log('✅ String de conexão gerada');
    console.log('\n📋 Configuração do Projeto Neon:');
    console.log('='.repeat(60));
    console.log(`🌐 Console: https://console.neon.tech/app/projects/${project.project.id}`);
    console.log(`🆔 Project ID: ${project.project.id}`);
    console.log(`🌿 Branch: ${branch.branch.name}`);
    console.log(`🔌 Host: ${connectionDetails.host}`);
    console.log(`📊 Database: ${connectionDetails.database_name}`);
    console.log(`👤 User: ${connectionDetails.user}`);
    console.log(`🔑 Password: ${connectionDetails.password}`);
    console.log('='.repeat(60));

    // 5. Criar arquivo de configuração
    const configContent = `# Neon Database Configuration
# Projeto criado automaticamente

export NEON_DATABASE_URL="${connectionString}"
export NEON_PROJECT_ID="${project.project.id}"
export NEON_BRANCH_ID="${branch.branch.id}"
export NEON_HOST="${connectionDetails.host}"
export NEON_DATABASE="${connectionDetails.database_name}"
export NEON_USER="${connectionDetails.user}"
export NEON_PASSWORD="${connectionDetails.password}"

# Para usar no script de migração:
# export NEON_DATABASE_URL="${connectionString}"
`;

    const fs = await import('fs');
    fs.writeFileSync('.env.neon.project', configContent);
    
    console.log('\n📝 Arquivo .env.neon.project criado com as configurações');
    
    console.log('\n🎉 Projeto Neon criado com sucesso!');
    console.log('\n📋 Próximos passos:');
    console.log('1. Configure as variáveis de ambiente:');
    console.log(`   export NEON_DATABASE_URL="${connectionString}"`);
    console.log('2. Execute a migração:');
    console.log('   node scripts/migrate-to-neon.js');
    console.log('\n🔗 Acesse o console: https://console.neon.tech/app/projects/' + project.project.id);

  } catch (error) {
    console.error('💥 Erro ao criar projeto Neon:', error.message);
    
    if (error.message.includes('401')) {
      console.log('\n🔑 Token de API inválido. Verifique se o NEON_API_TOKEN está correto.');
    } else if (error.message.includes('409')) {
      console.log('\n⚠️ Projeto já existe. Use o script de migração diretamente.');
    }
    
    process.exit(1);
  }
}

// Executar criação do projeto
createNeonProject().catch(console.error);