# Guida al Deploy in Produzione (Self-Hosted)

Questo documento descrive la strategia per migrare l'applicazione **W4U** da Vercel a un server dedicato (VPS Linux, es. Ubuntu).

## 1. Architettura Corrente vs Destinazione

### Cosa fa Vercel attualmente?
Prima di migrare, è importante capire quali compiti stiamo delegando a Vercel:
1.  **Hosting Statico**: Vercel serve i file compilati della tua cartella `dist/` (HTML, JS, CSS). Su un server dedicato, questo compito spetta a **Nginx**.
2.  **Serverless Functions**: Ogni richiesta a `/api/*` viene gestita da Vercel come una funzione isolata. Questo limita i tempi di esecuzione (timeout). Sul server dedicato, il backend sarà un **processo Node.js persistente** (gestito da PM2), il che permette elaborazioni molto più lunghe senza interruzioni.
3.  **Routing e Rewrite**: Le regole nel tuo `vercel.json` gestiscono il reindirizzamento delle rotte SPA e dei Webhook. Queste regole andranno traslate nella **configurazione di Nginx**.
4.  **Gestione SSL**: Vercel fornisce HTTPS automatico. Sul server dedicato useremo **Certbot**.

### Server Dedicato (Destinazione)
- **Web Server (Nginx)**: Serve i file statici del frontend e agisce da Reverse Proxy per le API.
- **Process Manager (PM2)**: Mantiene in esecuzione costante il processo Node.js del backend.
- **Dipendenze OS**: Installazione manuale di Chromium e delle librerie di sistema per Puppeteer.

---

## 2. Preparazione del Server (Linux/Ubuntu)

### Installazione Dipendenze Base
```bash
# Aggiorna il sistema
sudo apt update && sudo apt upgrade -y

# Installa Node.js (versione 20+)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Installa PM2 globalmente
sudo npm install pm2 -g

# Installa Nginx
sudo apt install nginx -y
```

### Installazione Dipendenze per Puppeteer
Su un server Linux "pulito", Puppeteer ha bisogno di diverse librerie grafiche per funzionare:
```bash
sudo apt-get install -y \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libc6 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgbm1 \
    libgcc1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libstdc++6 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    lsb-release \
    wget \
    xdg-utils
```

---

## 3. Configurazione dell'Applicazione

### Build del Frontend
Esegui localmente o sul server:
```bash
npm install
npm run build
```
Questo genererà la cartella `dist/`.

### Configurazione Backend (PM2)
Crea un file `.env` nella root del server con tutte le chiavi (Supabase, Stripe, etc.).
Poi avvia il server:
```bash
pm2 start server/index.cjs --name "w4u-backend"
```

---

## 4. Configurazione Nginx (Reverse Proxy)

Configura Nginx per servire il sito su una porta (es. 80 o 443 con SSL):

```nginx
server {
    listen 80;
    server_name tuo-dominio.it;

    # Frontend Statico
    location / {
        root /var/www/w4u/dist;
        index index.html;
        try_files $uri $uri/ /index.html;
    }

    # Backend API
    location /api/ {
        proxy_pass http://localhost:3001; # La porta definita nel tuo .env o server/index.cjs
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # Export e altri percorsi
    location /export/ {
        proxy_pass http://localhost:3001;
        # Aumenta i timeout per generazioni lunghe (PDF/Docx)
        proxy_read_timeout 300s;
        proxy_connect_timeout 300s;
    }
}
```

---

## 5. Mappatura Variabili d'Ambiente

Dovrai creare un file `.env` sul server. Ecco le variabili principali da migrare dal pannello Vercel:

| Variabile | Scopo | Note |
| :--- | :--- | :--- |
| `VITE_SUPABASE_URL` | URL del database Supabase | Necessaria sia per build che per runtime |
| `VITE_SUPABASE_ANON_KEY` | Chiave anonima Supabase | Necessaria per il frontend |
| `SUPABASE_SERVICE_ROLE_KEY` | Chiave admin Supabase | **CRITICA**: Non esporre mai al frontend! |
| `STRIPE_SECRET_KEY` | Chiave segreta per pagamenti | Solo lato server |
| `N8N_WEBHOOK_URL` | URL base del tuo n8n | Es: `https://auto.mamadev.org` |
| `PORT` | Porta del server Node | Default: `3001` |
| `VERCEL` | Flag di ambiente | **Lascia vuota** o non impostare sul nuovo server |

---

## 7. Gestione Concorrenza e Scalabilità (Multi-Utente)

In un ambiente di produzione, la gestione di richieste simultanee (specialmente quelle "pesanti" come la generazione di libri o PDF) è critica. Ecco le strategie professionali per garantire stabilità:

### A. PM2 Cluster Mode
Invece di eseguire un singolo processo, usa il Cluster Mode per distribuire il carico su tutti i core della CPU disponibili:
```bash
# Avvia il backend sfruttando tutti i core
pm2 start server/index.cjs -i max --name "w4u-backend"
```

### B. n8n Queue Mode (L'approccio Enterprise)
Se n8n gestisce la logica di scrittura/generazione, non farlo girare in modalità "single process". In produzione si usa il **Queue Mode**:
1.  **Main Instance**: Gestisce l'editor e la dashboard.
2.  **Redis**: Usato come message broker per le code.
3.  **Workers**: Processi separati che eseguono i workflow. Puoi scalare aggiungendo più Worker se le richieste aumentano.
*Riferimento: [n8n Queue Mode Documentation](https://docs.n8n.io/hosting/scaling/queue-mode/)*

### C. Gestione Code (Background Tasks)
Per evitare che il frontend rimanga in attesa (rischiando timeout del browser), implementa un pattern asincrono:
1.  Il backend riceve la richiesta e risponde subito con un `202 Accepted` e un `job_id`.
2.  Il task viene inserito in una coda (es. **BullMQ** con Redis).
3.  L'utente vede una barra di caricamento che interroga il backend (polling) o riceve un segnale (WebSocket) a lavoro finito.
4.  Questo previene il crash del server perché la coda processa solo X libri alla volta (es. 2 alla volta) in base alle risorse disponibili.

### D. Limitazione Risorse Puppeteer
Puppeteer è estremamente energivoro (RAM). Se il tuo backend avvia Puppeteer direttamente:
-   Usa un **Browser Pool**: non aprire un nuovo browser per ogni richiesta, riutilizza le istanze o limita rigorosamente il numero di pagine (`tabs`) aperte simultaneamente.
-   Imposta `--disable-dev-shm-usage` e `--no-sandbox` nei `launch arguments`.

### E. Rate Limiting (Nginx)
Previeni attacchi o sovraccarichi limitando il numero di richieste per IP:
```nginx
limit_req_zone $binary_remote_addr zone=mylimit:10m rate=10r/s;

server {
    location /api/ {
        limit_req zone=mylimit burst=20 nodelay;
        proxy_pass http://localhost:3001;
    }
}
```

---

## 8. Monitoraggio e Log

Per gestire il progetto in modo professionale, devi sapere cosa succede:
-   **PM2 Logs**: `pm2 logs w4u-backend` per vedere errori in tempo reale.
-   **Uptime Monitoring**: Usa servizi come *UptimeRobot* o *Better Stack* per ricevere avvisi se il server cade.
-   **Error Tracking**: Integra **Sentry** nel backend per ricevere notifiche immediate su bug che colpiscono gli utenti.
