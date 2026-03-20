# Rapporto Tecnico: Debugging Generazione Libri (20/03/2026)

Questo documento riassume i problemi riscontrati durante i test di generazione, le cause radice individuate e le soluzioni applicate.

## 1. Errore Validazione Word Count (10 Parole)

### Problema
La generazione del Capitolo 1 falliva sistematicamente con l'errore:
`Chapter 1 validation failed: 10 words is below minimum 2125`.

### Analisi e Log
Controllando il database con la query:
```sql
SELECT id, content, actual_word_count FROM paragraphs WHERE chapter_id = '...';
```
Abbiamo riscontrato che i paragrafi avevano un testo lungo (es. 800 caratteri) ma un `actual_word_count` di **1**.

### Causa Radice: "Comma Shifting" su n8n
Il nodo n8n `Update Paragraph` usava una stringa separata da virgole per passare i parametri alla query SQL.
- Quando l'AI generava un testo contenente virgole, n8n "spezzava" il testo alla prima virgola.
- La parte restante della frase veniva erroneamente assegnata ai parametri successivi (`id` e `word_count`).
- Questo corrompeva il conteggio parole salvato nel DB.

### Fix Applicato
- Modificato il file [w4u_workflow.json](file:///c:/Users/genco/Desktop/lavoro/w4uN8N/n8n/workflows/w4u_workflow.json).
- Sostituito il passaggio dei parametri da stringa a **Array** (più sicuro, ignora le virgole interne).
- **Recupero Dati**: Eseguito script SQL per ricalcolare i word count corretti dai testi esistenti.

---

## 2. Caricamento Infinito (UI Hanging)

### Problema
Ricaricando la pagina, il Writing Wizard rimaneva in uno stato di caricamento perenne senza avviare il workflow.

### Causa Radice
Nel database erano rimasti dei record in tabella `book_generation_runs` con stato `pending` o `started` che non erano mai stati chiusi a causa dei precedenti fallimenti. L'orchestratore del server vedeva queste "code" attive e rimaneva in attesa infinita.

### Fix Applicato
Eseguito script di **System Reset**:
```sql
UPDATE book_generation_runs 
SET status = 'failed', last_error = 'System Reset'
WHERE status IN ('pending', 'processing', 'started');
```

---

## 3. Errore 403 Forbidden (Blueprint Confirm)

### Problema
Provando ad approvare la struttura del libro (Blueprint), la console del browser mostrava:
`POST .../rest/v1/chapters ... 403 (Forbidden)`.
Il messaggio sul frontend era: `Error saving blueprint: Object`.

### Causa Radice: RLS (Row Level Security)
Le politiche di sicurezza di Supabase sulla tabella `chapters` erano troppo restrittive:
- Permettevano a tutti gli Admin di **vedere** i capitoli.
- Permettevano di **modificare** i capitoli solo al proprietario originale del libro.
- Quando un amministratore diverso provava a "salvare" o "rifare" la struttura, Supabase bloccava l'operazione con un 403.

### Fix Applicato
Abbiamo aggiunto nuove policy RLS specifiche per gli amministratori:
```sql
CREATE POLICY "Admins can manage any chapter" ON chapters
    FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));
```

---

nonostante tutto l'errore rimane invariato

**Azioni rimanenti**:
1.  **Import Workflow**: È fondamentale importare l'ultima versione di `w4u_workflow.json` su n8n per rendere definitiva la correzione del word count.
2.  **Test Generazione**: Avviando un nuovo libro, il Blueprint dovrebbe ora salvarsi senza errori 403 e i word count dovrebbero essere precisi.
