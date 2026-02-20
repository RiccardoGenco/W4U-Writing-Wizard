export default function handler(req, res) {
    res.status(200).json({
        status: 'ok',
        message: 'Vercel Function is working',
        env: process.env.VERCEL ? 'vercel' : 'local'
    });
}
