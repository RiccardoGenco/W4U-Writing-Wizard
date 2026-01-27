const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

const envPath = path.join(__dirname, '../.env');
console.log('Checking .env at:', envPath);
if (fs.existsSync(envPath)) {
    console.log('.env exists');
    const result = dotenv.config({ path: envPath });
    if (result.error) {
        console.error('Dotenv error:', result.error);
    } else {
        console.log('VITE_SUPABASE_URL:', process.env.VITE_SUPABASE_URL ? 'Loaded' : 'NOT FOUND');
        console.log('Value starts with:', process.env.VITE_SUPABASE_URL ? process.env.VITE_SUPABASE_URL.substring(0, 10) + '...' : 'N/A');
    }
} else {
    console.log('.env NOT FOUND');
}
