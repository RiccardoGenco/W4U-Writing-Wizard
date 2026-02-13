
export type GenreCategory = 'Non-Fiction e Manualistica' | 'Altri Generi Chiave' | 'Fiction (Narrativa di Genere)';

export interface GenreDefinition {
    label: string;
    category: GenreCategory;
    questions: string[];
    description?: string;
}

export const GENRE_DEFINITIONS: Record<string, GenreDefinition> = {
    // GRUPPO 1: Non-Fiction e Manualistica
    'Business & Self-Help': {
        label: 'Business & Self-Help',
        category: 'Non-Fiction e Manualistica',
        questions: [
            'Qual è il problema principale che vuoi aiutare il lettore a risolvere?',
            'Quale "promessa" o risultato misurabile otterrà il lettore a fine libro?',
            'Qual è il profilo ideale del tuo lettore (es. dipendente insoddisfatto, manager)?',
            'Esiste un metodo o una "formula" proprietaria che vuoi presentare?',
            'Qual è l\'ostacolo più comune che impedisce al lettore di avere successo in questo campo?',
            'Vuoi includere esercizi pratici o riflessioni alla fine di ogni capitolo?',
            'Quale tono preferisci: motivazionale e diretto o analitico e basato sui dati?',
            'Qual è il "falso mito" in questo settore che vuoi smascherare?'
        ]
    },
    'Salute, Dieta e Benessere': {
        label: 'Salute, Dieta e Benessere',
        category: 'Non-Fiction e Manualistica',
        questions: [
            'Qual è il regime alimentare o lo stile di vita specifico trattato (es. Keto, Mindfulness)?',
            'Il libro è per principianti assoluti o per esperti della materia?',
            'Quali sono i benefici fisici o mentali immediati promessi?',
            'Vuoi inserire piani d\'azione settimanali o ricette?',
            'C\'è un\'evidenza scientifica o uno studio di riferimento su cui si basa il libro?',
            'Qual è l\'approccio verso le "eccezioni" o le difficoltà del percorso?',
            'Vuoi che il tono sia rassicurante e accogliente o rigoroso e clinico?',
            'Qual è l\'errore numero uno che le persone commettono cercando di stare meglio?'
        ]
    },
    'Finanza Personale e Investimenti': {
        label: 'Finanza Personale e Investimenti',
        category: 'Non-Fiction e Manualistica',
        questions: [
            'Qual è l\'obiettivo finanziario trattato (es. risparmio, trading, immobiliare)?',
            'A quale fascia di reddito o età si rivolge il libro?',
            'Qual è il rischio principale che vuoi insegnare a gestire?',
            'Vuoi fornire dei template di calcolo o delle liste di controllo?',
            'Qual è il capitale minimo o il prerequisito per iniziare a seguire i tuoi consigli?',
            'Il tono deve essere prudente e conservativo o dinamico e aggressivo?',
            'Quali sono gli strumenti tecnologici consigliati (es. app, piattaforme)?',
            'Qual è la lezione più importante che hai imparato sulla gestione del denaro?'
        ]
    },
    'Hobby e Passioni': {
        label: 'Hobby e Passioni',
        category: 'Non-Fiction e Manualistica',
        questions: [
            'Qual è l\'attività specifica descritta (es. coltivare bonsai, restauro mobili)?',
            'Quali attrezzi o ingredienti base deve possedere il lettore?',
            'Vuoi una struttura basata sulla stagionalità o sulla difficoltà crescente?',
            'Quali sono i "trucchi del mestiere" poco conosciuti che vuoi rivelare?',
            'Qual è l\'ambiente o lo spazio necessario per svolgere l\'attività?',
            'Preferisci un tono colloquiale e amichevole (stile blog) o da manuale d\'istruzioni?',
            'Qual è il problema tecnico più frustrante che risolveremo?',
            'Vuoi che il libro sia ricco di liste di materiali e fornitori?'
        ]
    },
    'Spiritualità e New Age': {
        label: 'Spiritualità e New Age',
        category: 'Non-Fiction e Manualistica',
        questions: [
            'Qual è il tema centrale (es. astrologia, meditazione, manifestazioni)?',
            'Il lettore cerca conforto emotivo o una guida pratica?',
            'Vuoi includere rituali o preghiere specifiche?',
            'Qual è la connessione tra la pratica e la vita quotidiana?',
            'Il tono deve essere poetico ed evocativo o semplice e accessibile?',
            'Quali sono i "segnali" che il lettore dovrebbe imparare a riconoscere?',
            'Vuoi fare riferimento a tradizioni antiche o a concetti moderni?',
            'Qual è la trasformazione interiore finale che prometti al lettore?'
        ]
    },

    // GRUPPO 2: Altri Generi Chiave
    'Relazioni e Parenting': {
        label: 'Relazioni e Parenting',
        category: 'Altri Generi Chiave',
        questions: [
            'Qual è la dinamica relazionale principale che vuoi affrontare?',
            'Qual è la fascia d\'età o il target specifico (es. genitori di adolescenti, coppie in crisi)?',
            'Qual è il problema di comunicazione più frequente?',
            'Vuoi offrire strategie di risoluzione dei conflitti?',
            'Qual è il ruolo dell\'empatia nel tuo approccio?',
            'Ci sono esercizi pratici da fare in coppia o in famiglia?',
            'Qual è l\'obiettivo finale: armonia, indipendenza o comprensione?',
            'Qual è un errore comune che vuoi aiutare a evitare?'
        ]
    },
    'Tecnologia e AI': {
        label: 'Tecnologia e AI',
        category: 'Altri Generi Chiave',
        questions: [
            'Quale tecnologia o software specifico stai trattando?',
            'Il lettore ha bisogno di un background tecnico o è per principianti?',
            'Qual è il problema pratico che questa tecnologia risolve?',
            'Vuoi includere tutorial passo-passo o screenshot?',
            'Quali sono i rischi o le limitazioni di questa tecnologia?',
            'Come vedi l\'evoluzione futura di questo strumento?',
            'Quali risorse aggiuntive consiglieresti?',
            'Qual è il "wow factor" che vuoi mostrare al lettore?'
        ]
    },
    'Viaggi e Guide di Nicchia': {
        label: 'Viaggi e Guide di Nicchia',
        category: 'Altri Generi Chiave',
        questions: [
            'Qual è la destinazione o il tema del viaggio (es. Giappone low cost, trekking alpino)?',
            'Ti rivolgi a viaggiatori solitari, famiglie o coppie?',
            'Qual è il budget previsto per questo tipo di esperienza?',
            'Vuoi includere itinerari giorno per giorno?',
            'Quali sono le "gemme nascoste" che solo i locali conoscono?',
            'Quali consigli pratici (visti, trasporti, sicurezza) sono essenziali?',
            'Qual è l\'aspetto culturale o gastronomico da non perdere?',
            'Quale emozione vuoi evocare con la descrizione dei luoghi?'
        ]
    },
    'Biografie e Memorie': {
        label: 'Biografie e Memorie',
        category: 'Altri Generi Chiave',
        questions: [
            'Chi è il soggetto della biografia e perché la sua storia è importante?',
            'Qual è l\'evento trasformativo o il punto di svolta della vita?',
            'Quale insegnamento o messaggio vuoi lasciare ai posteri?',
            'Qual è il contesto storico o sociale in cui si svolge la vita?',
            'Ci sono antagonisti o ostacoli significativi affrontati?',
            'Vuoi usare un ordine cronologico o tematico?',
            'Qual è il tono: celebrativo, intimo o critico?',
            'Qual è l\'eredità che questa persona lascia?'
        ]
    },
    'Saggistica Scientifica o Storica': {
        label: 'Saggistica Scientifica o Storica',
        category: 'Altri Generi Chiave',
        questions: [
            'Quale periodo storico, evento o teoria scientifica tratti?',
            'Qual è la tesi principale o la nuova prospettiva che offri?',
            'Il tono è divulgativo (per tutti) o accademico (per specialisti)?',
            'Quali fonti o documenti inediti utilizzi?',
            'Qual è la rilevanza di questo argomento nel mondo di oggi?',
            'Ci sono figure chiave o protagonisti che guidano la narrazione?',
            'Qual è il dettaglio più sorprendente o controintuitivo?',
            'Cosa vuoi che il lettore capisca o riconsideri alla fine?'
        ]
    },

    // GRUPPO 3: Fiction (Narrativa di Genere)
    'Giallo e Thriller': {
        label: 'Giallo e Thriller',
        category: 'Fiction (Narrativa di Genere)',
        questions: [
            'Qual è il crimine o il mistero centrale da risolvere?',
            'Chi è il protagonista (detective, civile, vittima)?',
            'Qual è l\'ambientazione (es. cupa metropoli, villaggio isolato)?',
            'Qual è il "colpo di scena" o la falsa pista principale?',
            'Qual è il segreto oscuro che il colpevole nasconde?',
            'Il tono deve essere adrenalinico o psicologico e lento?',
            'Qual è l\'arma o il metodo del delitto?',
            'Qual è la posta in gioco se il colpevole non viene catturato?'
        ]
    },
    'Romance': {
        label: 'Romance',
        category: 'Fiction (Narrativa di Genere)',
        questions: [
            'Qual è il sottogenere (es. contemporaneo, storico, enemies-to-lovers)?',
            'Chi sono i due protagonisti e cosa li divide inizialmente?',
            'Qual è l\'ambientazione "romantica" principale?',
            'Qual è il trauma passato che impedisce loro di amarsi?',
            'C\'è un lieto fine garantito o una conclusione agrodolce?',
            'Qual è il livello di sensualità (da "pulito" a "esplicito")?',
            'Qual è l\'elemento che li costringe a passare del tempo insieme?',
            'Qual è il tono: ironico e leggero o drammatico e intenso?'
        ]
    },
    'Fantasy': {
        label: 'Fantasy',
        category: 'Fiction (Narrativa di Genere)',
        questions: [
            'Qual è il sistema di magia o l\'elemento sovrannaturale principale?',
            'In quale mondo o epoca è ambientata la storia?',
            'Chi è l\'antagonista o la forza oscura da sconfiggere?',
            'Qual è la "profezia" o l\'oggetto del desiderio (quest)?',
            'Quali sono le diverse razze o classi sociali presenti?',
            'Il tono deve essere epico e solenne o "urban" e moderno?',
            'Qual è il costo della magia nel tuo mondo?',
            'Qual è la lezione morale o il tema di fondo della storia?'
        ]
    },
    'Sci-Fi': {
        label: 'Sci-Fi (Fantascienza)',
        category: 'Fiction (Narrativa di Genere)',
        questions: [
            'Qual è l\'avanzamento tecnologico o il cambiamento sociale cardine?',
            'Si svolge sulla Terra, su un pianeta alieno o nello spazio?',
            'Qual è il conflitto tra uomo e tecnologia (o alieni)?',
            'È un futuro distopico (cupo) o utopico (ideale)?',
            'Qual è la risorsa per cui tutti lottano?',
            'Il tono deve essere "Hard Sci-Fi" (scientifico) o d\'avventura?',
            'Come si viaggia o si comunica in questo futuro?',
            'Qual è il monito che vuoi lanciare al presente?'
        ]
    },
    'Horror': {
        label: 'Horror',
        category: 'Fiction (Narrativa di Genere)',
        questions: [
            'Qual è l\'entità o la forza maligna principale?',
            'Qual è l\'ambientazione isolata o claustrofobica?',
            'Qual è la paura primaria che vuoi stimolare (ignoto, morte, follia)?',
            'Chi sono i protagonisti e perché sono vulnerabili?',
            'Qual è l\'origine del male (soprannaturale o umana)?',
            'Come si manifesta la presenza maligna inizialmente?',
            'Qual è il destino peggiore della morte che rischiano i personaggi?',
            'C\'è una speranza di salvezza o è un incubo senza fine?'
        ]
    },
    'Storico': {
        label: 'Storico',
        category: 'Fiction (Narrativa di Genere)',
        questions: [
            'In quale epoca e luogo preciso è ambientata la storia?',
            'Quali eventi storici reali fanno da sfondo alla trama?',
            'Chi è il protagonista (personaggio reale o inventato)?',
            'Qual è il conflitto personale che si intreccia con la grande storia?',
            'Quanto è importante l\'accuratezza storica rispetto alla narrazione?',
            'Quali dettagli d\'epoca (vestiti, cibo, linguaggio) vuoi evidenziare?',
            'Qual è il messaggio universale che questa epoca ci trasmette?',
            'Come finisce la storia rispetto agli eventi storici noti?'
        ]
    },
    'Young Adult': {
        label: 'Young Adult',
        category: 'Fiction (Narrativa di Genere)',
        questions: [
            'Qual è il rito di passaggio o la sfida di crescita principale?',
            'Chi è il protagonista e qual è il suo desiderio di ribellione?',
            'Qual è il contesto sociale (scuola, distopia, famiglia)?',
            'C\'è una storia d\'amore o un triangolo amoroso importante?',
            'Qual è il tema dell\'identità che viene esplorato?',
            'Il tono è realistico e crudo o fantastico?',
            'Qual è il rapporto con il mondo degli adulti?',
            'Qual è la consapevolezza finale acquisita dal protagonista?'
        ]
    },

    'Distopico': {
        label: 'Distopico',
        category: 'Fiction (Narrativa di Genere)',
        questions: [
            'Qual è la regola oppressione che governa la società?',
            'Chi detiene il potere e come lo mantiene?',
            'Qual è l\'evento che ha portato a questo mondo?',
            'Chi è il ribelle o l\'elemento di disturbo?',
            'Qual è il simbolo della resistenza?',
            'La tecnologia è uno strumento di controllo o di liberazione?',
            'Qual è il sacrificio richiesto per la libertà?',
            'C\'è una speranza di rovesciare il sistema?'
        ]
    },
    'Avventura': {
        label: 'Avventura',
        category: 'Fiction (Narrativa di Genere)',
        questions: [
            'Qual è l\'obiettivo del viaggio o della missione?',
            'Quali sono i pericoli fisici o naturali da affrontare?',
            'Chi è l\'eroe e chi sono i suoi compagni di viaggio?',
            'Qual è l\'ambientazione esotica o sconosciuta?',
            'C\'è una corsa contro il tempo?',
            'Qual è il tesoro o la scoperta finale?',
            'Quali abilità speciali sono richieste per sopravvivere?',
            'Come cambia l\'eroe dopo aver affrontato le prove?'
        ]
    },
};

export const getQuestionsForGenre = (genreLabel: string): string[] => {
    return GENRE_DEFINITIONS[genreLabel]?.questions || GENRE_DEFINITIONS['Thriller'].questions;
};

export const getGenresByCategory = () => {
    const categories: Record<string, GenreDefinition[]> = {};

    Object.values(GENRE_DEFINITIONS).forEach(genre => {
        if (!categories[genre.category]) {
            categories[genre.category] = [];
        }
        categories[genre.category].push(genre);
    });

    return categories;
};
