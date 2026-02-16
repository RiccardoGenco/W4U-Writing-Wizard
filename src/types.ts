export interface ConceptCard {
    id: string;
    title: string;
    description: string;
    style: string;
}

export interface BookConfiguration {
    toneSerious: number;
    toneConcise: number;
    toneSimple: number;
    targets: string[];
    chaptersRate: number;
}

export interface Chapter {
    id: string;
    title: string;
    summary?: string;
    scene_description?: string;
    content?: string;
    status: 'pending' | 'generating' | 'completed' | 'error';
}

export interface BookContext {
    answers?: string[];
    pseudonym?: string;
    selected_concept?: ConceptCard;
    uploaded_materials_summary?: string;
    configuration?: BookConfiguration;
    target_pages?: number;
    // Add other flexible context fields here
    [key: string]: any;
}

export interface Book {
    id: string;
    title: string;
    genre: string;
    author: string;
    created_at: string;
    user_id?: string;
    status: 'IDEA' | 'CONFIGURATION' | 'BLUEPRINT' | 'PRODUCTION' | 'COMPLETED';
    context_data: BookContext;
}

export interface ApiError {
    message: string;
    code?: string;
    status?: number;
}
