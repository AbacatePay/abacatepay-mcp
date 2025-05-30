#!/usr/bin/env node

import inquirer from 'inquirer';
import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

console.log('🥑 Abacate Pay MCP Inspector');
console.log('================================\n');

async function checkAndBuild() {
    const distPath = join(projectRoot, 'dist', 'index.js');
    
    if (!existsSync(distPath)) {
        console.log('❌ Projeto não compilado. Compilando agora...');
        
        return new Promise((resolve, reject) => {
            const build = spawn('npm', ['run', 'build'], { 
                cwd: projectRoot, 
                stdio: 'inherit' 
            });
            
            build.on('close', (code) => {
                if (code === 0) {
                    console.log('✅ Projeto compilado com sucesso!\n');
                    resolve();
                } else {
                    console.log('❌ Erro ao compilar o projeto. Verifique se as dependências estão instaladas (npm install)');
                    reject(new Error('Build failed'));
                }
            });
        });
    }
}

async function getApiKey() {
    // Verifica se já existe na variável de ambiente
    if (process.env.ABACATE_PAY_API_KEY) {
        console.log('✅ Chave de API encontrada na variável de ambiente');
        return process.env.ABACATE_PAY_API_KEY;
    }
    
    // Pede a chave de forma interativa
    const answers = await inquirer.prompt([
        {
            type: 'password',
            name: 'apiKey',
            message: '🔑 Digite sua chave de API do Abacate Pay:',
            mask: '*',
            validate: (input) => {
                if (!input || input.trim() === '') {
                    return '❌ Chave de API é obrigatória';
                }
                return true;
            }
        }
    ]);
    
    console.log('✅ Chave de API recebida');
    return answers.apiKey;
}

async function startInspector(apiKey) {
    console.log('🚀 Iniciando MCP Inspector...\n');
    
    if (!process.env.ABACATE_PAY_API_KEY) {
        console.log('💡 Dica: Para não precisar digitar a chave toda vez, você pode:');
        console.log('   export ABACATE_PAY_API_KEY="sua_chave_aqui"\n');
    }
    
    const inspector = spawn('npx', [
        '@modelcontextprotocol/inspector', 
        'node', 
        'dist/index.js'
    ], {
        cwd: projectRoot,
        stdio: 'inherit',
        env: {
            ...process.env,
            ABACATE_PAY_API_KEY: apiKey
        }
    });
    
    inspector.on('close', (code) => {
        if (code !== 0) {
            console.log(`\n❌ MCP Inspector encerrado com código ${code}`);
        }
    });
}

async function main() {
    try {
        await checkAndBuild();
        const apiKey = await getApiKey();
        await startInspector(apiKey);
    } catch (error) {
        console.error('❌ Erro:', error.message);
        process.exit(1);
    }
}

main(); 