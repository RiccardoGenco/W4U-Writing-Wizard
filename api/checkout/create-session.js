import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const APP_URL = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : (process.env.VITE_APP_URL || 'http://localhost:5173');

// Mock mode = no real Stripe key configured
const IS_MOCK = !STRIPE_SECRET_KEY || STRIPE_SECRET_KEY === 'sk_test_placeholder';

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    // Auth
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Missing authorization header' });
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
        console.error('[checkout] Missing SUPABASE env vars');
        return res.status(500).json({ error: 'Configurazione server mancante.' });
    }

    const token = authHeader.split(' ')[1];
    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: { user }, error: authError } = await adminClient.auth.getUser(token);

    if (authError || !user) {
        return res.status(401).json({ error: 'Sessione non valida. Riaccedi.' });
    }

    // Validate amount
    const { amount } = req.body;
    const parsedAmount = Number(amount);
    if (!parsedAmount || parsedAmount < 5) {
        return res.status(400).json({ error: "L'importo minimo è di €5." });
    }

    // ── MOCK MODE ──────────────────────────────────────────────────────────────
    if (IS_MOCK) {
        try {
            // Try to get existing wallet
            const { data: wallet, error: walletErr } = await adminClient
                .from('user_wallets')
                .select('id, balance')
                .eq('user_id', user.id)
                .maybeSingle();

            if (walletErr) throw walletErr;

            if (wallet) {
                // Update existing wallet
                const { error: updateErr } = await adminClient
                    .from('user_wallets')
                    .update({ balance: Number(wallet.balance) + parsedAmount, updated_at: new Date().toISOString() })
                    .eq('id', wallet.id);
                if (updateErr) throw updateErr;
            } else {
                // Create new wallet
                const { error: insertErr } = await adminClient
                    .from('user_wallets')
                    .insert({ user_id: user.id, balance: parsedAmount });
                if (insertErr) throw insertErr;
            }

            return res.status(200).json({
                url: `${APP_URL}/pricing/success?mock=true&amount=${parsedAmount}`
            });
        } catch (err) {
            console.error('[checkout] Mock error:', err);
            return res.status(500).json({ error: 'Errore durante la ricarica mock: ' + err.message });
        }
    }

    // ── REAL STRIPE ────────────────────────────────────────────────────────────
    try {
        const Stripe = (await import('stripe')).default;
        const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2024-10-28.acacia' });

        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [{
                price_data: {
                    currency: 'eur',
                    product_data: { name: `Ricarica Wallet W4U — €${parsedAmount}` },
                    unit_amount: Math.round(parsedAmount * 100),
                },
                quantity: 1,
            }],
            mode: 'payment',
            success_url: `${APP_URL}/pricing/success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${APP_URL}/pricing`,
            metadata: { user_id: user.id, amount: String(parsedAmount) }
        });

        return res.status(200).json({ url: session.url });
    } catch (err) {
        console.error('[checkout] Stripe error:', err);
        return res.status(500).json({ error: 'Errore nel creare la sessione Stripe.' });
    }
}
