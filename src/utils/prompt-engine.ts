
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

import type { StyleFactor } from '../data/genres';

/**
 * Centralized logic to convert numeric tone sliders (0-1) into human-readable descriptions.
 */
export const getToneDescription = (
    bookType: 'FICTION' | 'NON_FICTION',
    styleValues: Record<string, number>,
    factors: StyleFactor[]
): string => {
    const parts: string[] = [];

    factors.forEach(f => {
        const val = styleValues[f.id] ?? f.defaultValue;

        // Skip if value is neutral (around 0.5) to avoid clutter,
        // UNLESS it's a critical factor or we want explicit instructions.
        // Let's be explicit for now.
        if (val > 0.6) {
            parts.push(f.labelHigh);
        } else if (val < 0.4) {
            parts.push(f.labelLow);
        } else {
            // Optional: parts.push(`Equilibrato (${f.labelLow}/${f.labelHigh})`);
        }
    });

    if (parts.length === 0) {
        return bookType === 'FICTION' ? "Stile narrativo bilanciato" : "Tono professionale e chiaro";
    }

    return parts.join(", ");
};
