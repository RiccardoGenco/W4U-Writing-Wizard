export const getRouteByStatus = (status: string): string => {
    switch (status) {
        case 'INTERVIEW':
            return '/create/concept';
        case 'CONFIGURATION':
            return '/create/configuration';
        case 'BLUEPRINT':
            return '/create/blueprint';
        case 'PRODUCTION':
            return '/create/production';
        case 'EDITOR':
            return '/create/editor';
        case 'EXPORT':
        case 'COVER':
            return '/create/finalize';

        default:
            return '/create/concept';
    }
};
