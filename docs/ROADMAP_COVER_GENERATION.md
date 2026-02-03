# 📚 Roadmap Implementazione - Generazione Copertina con DALL-E 3

## 🎯 Panoramica
Implementazione di un sistema completo per la generazione automatica di copertine libri usando OpenAI DALL-E 3, integrato nel flusso W4U Writing Wizard.

---

## 📋 FASE 1: Database (✅ COMPLETATA)

### Migration SQL
**File:** `supabase/migrations/20260203000000_add_cover_url_to_books.sql`

```sql
ALTER TABLE books 
ADD COLUMN IF NOT EXISTS cover_url TEXT;

COMMENT ON COLUMN books.cover_url IS 'URL of the AI-generated book cover image (DALL-E 3)';

CREATE INDEX IF NOT EXISTS idx_books_cover_url ON books(cover_url) 
WHERE cover_url IS NOT NULL;
```

### Istruzioni per applicare la migration:
1. Vai su Supabase Dashboard → SQL Editor
2. Copia e incolla il contenuto della migration
3. Esegui lo script
4. Verifica che il campo `cover_url` appaia nella tabella `books`

---

## 🔧 FASE 2: Backend n8n

### 2.1 Configurazione Credenziali OpenAI

**Prerequisiti:**
- Account OpenAI con API Key valida
- Accesso all'API DALL-E 3 (inclusa in GPT-4 Plus/Team)

**Configurazione in n8n:**
1. Vai su **Settings** → **Credentials**
2. Clicca **Add Credential**
3. Seleziona **OpenAI API**
4. Inserisci la tua API Key di OpenAI
5. Salva con nome: `OpenAI-DALLE3`

**Verifica quota:**
- DALL-E 3: $0.040 per immagine 1024x1024
- DALL-E 3 HD: $0.080 per immagine 1024x1024

---

### 2.2 Creazione Workflow n8n - GENERATE_COVER

#### **Webhook Trigger**
```
Method: POST
Path: generate-cover
Authentication: Header Auth (x-api-key)
```

#### **Struttura Workflow:**

**Nodo 1: Webhook (Trigger)**
- Endpoint riceve: `{ bookId, title, author, genre?, style? }`
- Autenticazione: API Key

**Nodo 2: Get Book Data (Supabase)**
- Query: Recupera dati libro da books.id
- Output: titolo, genere, sinossi, temi

**Nodo 3: Prepare Prompt (Code Node)**
```javascript
// Input: book data
// Output: ottimizzato prompt per DALL-E 3

const bookData = $input.first().json;

const prompt = `Professional book cover design for "${bookData.title}" by ${bookData.author}.

Book details:
- Genre: ${bookData.genre || 'Fiction'}
- Theme: ${bookData.theme || 'Literary fiction'}
- Mood: ${bookData.mood || 'Atmospheric and compelling'}

Design requirements:
- Professional book cover layout
- Title prominently displayed in elegant typography
- Author name at bottom
- High-quality artistic illustration
- Suitable for print and digital publishing
- No text other than title and author name
- Aspect ratio: 2:3 (portrait book cover)
- Style: ${bookData.style || 'Modern literary fiction aesthetic'}

The cover should capture the essence of the story and appeal to target readers. Professional quality suitable for Amazon Kindle, physical book printing, and marketing materials.`;

return { prompt };
```

**Nodo 4: OpenAI - Image Generation**
- **Credential:** OpenAI-DALLE3
- **Model:** dall-e-3
- **Prompt:** `{{$json.prompt}}`
- **Size:** 1024x1792 (portrait 2:3)
- **Quality:** standard (o hd per maggiore qualità)
- **N:** 1
- **Style:** vivid (o natural)

**Nodo 5: Download Image (HTTP Request)**
```
Method: GET
URL: {{$json.data[0].url}}  // URL dall'output DALL-E
Response Format: Binary
```

**Nodo 6: Upload to Supabase Storage (HTTP Request)**
```
Method: POST
URL: {{$env.SUPABASE_URL}}/storage/v1/object/covers/{{$json.bookId}}_cover.png
Headers:
  - Authorization: Bearer {{$env.SUPABASE_SERVICE_KEY}}
  - Content-Type: image/png
Body: Binary (dall'output nodo 5)
```

**Nodo 7: Get Public URL**
- Formula: `{{$env.SUPABASE_URL}}/storage/v1/object/public/covers/{{$json.bookId}}_cover.png`

**Nodo 8: Update Book Record (Supabase)**
- Table: books
- Update: cover_url = public URL
- Where: id = bookId

**Nodo 9: Webhook Response**
```json
{
  "success": true,
  "cover_url": "https://...",
  "bookId": "...",
  "generated_at": "..."
}
```

---

### 2.3 Configurazione Supabase Storage

**Creare bucket "covers":**
```sql
-- In Supabase SQL Editor
insert into storage.buckets (id, name, public)
values ('covers', 'covers', true);

-- Policy per upload (solo authenticated)
create policy "Allow authenticated uploads"
on storage.objects for insert
to authenticated
using (bucket_id = 'covers');

-- Policy per public read
create policy "Allow public read"
on storage.objects for select
to anon
using (bucket_id = 'covers');
```

---

### 2.4 Configurazione Ambiente n8n

**Variabili d'ambiente (.env):**
```
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_KEY=eyJ...
OPENAI_API_KEY=sk-...
WEBHOOK_API_KEY=your-secret-key
```

---

## 💻 FASE 3: Frontend

### 3.1 Aggiornamenti CoverPage

Il file `CoverPage.tsx` è già implementato con:
- ✅ Chiamata a `callBookAgent('GENERATE_COVER', ...)`
- ✅ Gestione stato loading
- ✅ Preview immagine
- ✅ Salvataggio URL su database
- ✅ Navigazione verso Export

### 3.2 Miglioramenti Suggeriti

**Aggiungere retry logic:**
```typescript
const generateCover = async (retryCount = 0) => {
    try {
        // ... codice esistente
    } catch (err) {
        if (retryCount < 3) {
            await new Promise(r => setTimeout(r, 2000));
            return generateCover(retryCount + 1);
        }
        throw err;
    }
};
```

**Aggiungere progress indicator:**
```typescript
const [progressStage, setProgressStage] = useState<string>('');

// Durante la generazione
setProgressStage('Analisi contenuto libro...');
setProgressStage('Generazione copertina con AI...');
setProgressStage('Finalizzazione e salvataggio...');
```

---

## 🧪 FASE 4: Testing

### Test Checklist:

- [ ] Migration SQL eseguita correttamente
- [ ] Credenziali OpenAI configurate in n8n
- [ ] Workflow n8n attivato e funzionante
- [ ] Bucket "covers" creato in Supabase Storage
- [ ] Chiamata POST /generate-cover funziona
- [ ] Immagine generata da DALL-E 3
- [ ] Immagine salvata correttamente in Storage
- [ ] URL immagine aggiornato in database
- [ ] Frontend visualizza preview correttamente
- [ ] Navigazione Cover → Export funziona

---

## 📊 Costi Stimati

**DALL-E 3 Pricing (2025):**
- Standard 1024x1024: $0.040/immagine
- Standard 1024x1792: $0.040/immagine
- HD 1024x1024: $0.080/immagine
- HD 1024x1792: $0.080/immagine

**Per libro:** ~$0.04-0.08 per copertina

---

## 🔒 Considerazioni di Sicurezza

1. **API Keys:** Non esporre mai le API keys nel frontend
2. **Rate Limiting:** Implementare rate limiting sul webhook
3. **Validazione:** Validare input prima di inviare a DALL-E
4. **Content Filter:** DALL-E 3 ha filtri automatici per contenuti inappropriati
5. **Storage:** Configurare CORS appropriato per il bucket

---

## 🚀 Prossimi Passi

1. **Applicare migration SQL** su Supabase
2. **Configurare n8n** con credenziali OpenAI
3. **Importare workflow** GENERATE_COVER
4. **Configurare bucket** "covers" in Supabase Storage
5. **Testare** con un libro di esempio
6. **Monitorare** costi e performance

---

## 📞 Supporto

Per problemi o domande:
- OpenAI API Docs: https://platform.openai.com/docs/guides/images
- n8n Docs: https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.openai/
- Supabase Storage: https://supabase.com/docs/guides/storage

