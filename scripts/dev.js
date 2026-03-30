import { spawn } from 'child_process';

console.log('🚀 Avvio del sistema di sviluppo unificato (Frontend + Backend)...');

// Avvia Vite (Frontend)
const vite = spawn('npx', ['vite'], { 
    shell: true, 
    stdio: 'inherit' 
});

// Avvia Express (Backend)
const server = spawn('node', ['server/index.cjs'], { 
    shell: true, 
    stdio: 'inherit' 
});

// Gestione della terminazione pulita
const cleanup = () => {
    console.log('\n🛑 Arresto dei server in corso...');
    vite.kill();
    server.kill();
    process.exit();
};

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
