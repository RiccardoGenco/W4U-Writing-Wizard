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

## 6. Considerazioni Critiche

1.  **Timeout**: Le funzioni orizzontali di Vercel hanno un timeout spesso limitato (10-60s). Su un server dedicato puoi estenderlo per la generazione di libri lunghi.
2.  **Variabili d'Ambiente**: Assicurati che `VITE_APP_URL` punti al nuovo dominio nel file `.env` prima della build del frontend.
3.  **Memoria**: Puppeteer consuma molta RAM. Assicurati che il server abbia almeno 2-4GB di RAM per gestire generazioni multiple.
4.  **SSL**: Usa `certbot` per ottenere certificati HTTPS gratuiti (Let's Encrypt).
5.  **Puppeteer Configuration**: Sul server dedicato, potresti dover modificare l'avvio di Puppeteer in `server/index.cjs` per usare il browser di sistema invece di quello integrato in `@sparticuz/chromium`.

> [!IMPORTANT]
> Sul nuovo server, dovrai impostare `VERCEL=false` (o semplicemente non impostarla) per far sì che `app.listen()` si attivi automaticamente all'avvio del processo.
