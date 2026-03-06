import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const MOCK_PAYMENTS = process.env.VITE_MOCK_PAYMENTS === 'true';
const APP_URL = process.env.VITE_APP_URL || 'https://w4-u-writing-wizard.vercel.app';

export default async function handler(req, res) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // --- Auth ---
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Missing authorization header' });
    }

    const token = authHeader.split(' ')[1];
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
        return res.status(401).json({ error: 'Unauthorized: invalid token' });
    }

    // --- Validate amount ---
    const { amount } = req.body;
    if (!amount || typeof amount !== 'number' || amount < 5) {
        return res.status(400).json({ error: "L'importo minimo è di €5." });
    }

    // --- Mock payment mode ---
    if (MOCK_PAYMENTS) {
        // Simulate a successful top-up directly in the DB
        const amountCents = Math.round(amount * 100);

        const { error: walletError } = await supabase.rpc('add_wallet_credit', {
            p_user_id: user.id,
            p_amount: amount,
            p_description: `[MOCK] Ricarica wallet €${amount}`,
            p_stripe_payment_intent_id: `mock_${Date.now()}`
        });

        if (walletError) {
            console.error('[checkout] Mock wallet error:', walletError);
            return res.status(500).json({ error: 'Errore durante la ricarica mock.' });
        }

        // Redirect to success page
        return res.status(200).json({
            url: `${APP_URL}/pricing/success?mock=true&amount=${amount}`
        });
    }

    // --- Real Stripe checkout ---
    if (!STRIPE_SECRET_KEY || STRIPE_SECRET_KEY === 'sk_test_placeholder') {
        return res.status(503).json({
            error: 'Il sistema di pagamento non è ancora configurato. Contatta il supporto.'
        });
    }

    try {
        const Stripe = (await import('stripe')).default;
        const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2024-10-28.acacia' });

        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [{
                price_data: {
                    currency: 'eur',
                    product_data: {
                        name: `Ricarica Wallet W4U — €${amount}`,
                        description: 'Credito per la generazione di manoscritti su Writing4You'
                    },
                    unit_amount: Math.round(amount * 100),
                },
                quantity: 1,
            }],
            mode: 'payment',
            success_url: `${APP_URL}/pricing/success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${APP_URL}/pricing`,
            metadata: {
                user_id: user.id,
                amount: String(amount)
            }
        });

        return res.status(200).json({ url: session.url });
    } catch (err) {
        console.error('[checkout] Stripe error:', err);
        return res.status(500).json({ error: 'Errore nel creare la sessione di pagamento.' });
    }
}
