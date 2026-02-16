
/**
 * Prompt Engine Utility
 * Handles safe variable injection and centralized tone logic.
 */

// Types of variables supported in prompts
export interface PromptVariables {
    tone?: string;
    target?: string;
    synopsis?: string;
    bookTitle?: string;
    genre?: string;
    chapterTitle?: string;
    chapterSummary?: string;
    [key: string]: string | undefined;
}

/**
 * Safely replaces {{tag}} placeholders in a template string.
 * Throws a warning or logs if tags are missing from variables.
 */
export const injectVariables = (template: string, variables: PromptVariables): string => {
    return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
        const value = variables[key];
        if (value === undefined) {
            console.warn(`[PromptEngine] Missing value for tag: ${match}`);
            return match; // Leave the tag if missing
        }
        return value;
    });
};

/**
 * Centralized logic to convert numeric tone sliders (0-1) into human-readable descriptions.
 */
export const getToneDescription = (
    bookType: 'FICTION' | 'NON_FICTION',
    serious: number,
    concise: number,
    simple: number
): string => {
    const parts: string[] = [];

    // Serious vs Playful
    if (serious > 0.6) {
        parts.push(bookType === 'FICTION' ? "Serio e Drammatico" : "Formale e Professionale");
    } else if (serious < 0.4) {
        parts.push(bookType === 'FICTION' ? "Leggero e Ironico" : "Colloquiale e Amichevole");
    } else {
        parts.push("Bilanciato");
    }

    // Concise vs Verbose
    if (concise > 0.6) {
        parts.push(bookType === 'FICTION' ? "Sintetico" : "Essenziale");
    } else if (concise < 0.4) {
        parts.push(bookType === 'FICTION' ? "Ricco di dettagli" : "Approfondito");
    }

    // Simple vs Complex
    if (simple > 0.6) {
        parts.push("Linguaggio semplice e accessibile");
    } else if (simple < 0.4) {
        parts.push(bookType === 'FICTION' ? "Stile letterario e complesso" : "Linguaggio tecnico per esperti");
    }

    return parts.join(", ");
};
