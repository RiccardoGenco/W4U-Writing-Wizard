const fetch = require('node-fetch');

// CONFIG
const WEBHOOK_PATH = 'book-agent-f5ryrr6ut656f';
const TEST_URL = `https://auto.mamadev.org/webhook-test/${WEBHOOK_PATH}`;
const PROD_URL = `https://auto.mamadev.org/webhook/${WEBHOOK_PATH}`;

// KEY from .env
const API_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIwM2Q5NjRjNi1hZTc0LTRkZjgtOGFjNi1mZGZiODM3ZWMwYzgiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzcxNTIwNDg5fQ.oty3nzJINoioh4i-Wscsk7ZcVsWYTE9vXX009hlS5RE";

async function testN8n() {
    console.log("--- TESTING N8N CONNECTIVITY ---");

    // 1. Test Production URL
    console.log(`\n1. Testing PRODUCTION URL: ${PROD_URL}`);
    try {
        const response = await fetch(PROD_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': API_KEY
            },
            body: JSON.stringify({ message: "Test from verification script (PROD)" })
        });
        console.log(`   Status: ${response.status} ${response.statusText}`);
        const text = await response.text();
        console.log(`   Response: ${text.substring(0, 100)}...`);
    } catch (error) {
        console.error('   Error:', error.message);
    }

    // 2. Test Editor URL
    console.log(`\n2. Testing EDITOR (Test) URL: ${TEST_URL}`);

    try {
        // Short timeout for test url
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000);

        const response = await fetch(TEST_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': API_KEY
            },
            body: JSON.stringify({ message: "Test from verification script (TEST)" }),
            signal: controller.signal
        });
        clearTimeout(timeout);
        console.log(`   Status: ${response.status} ${response.statusText}`);
        const text = await response.text();
        console.log(`   Response: ${text.substring(0, 100)}...`);
    } catch (error) {
        if (error.name === 'AbortError') {
            console.log('   Result: TIMEOUT (This is normal for Test URL if not executing manually)');
        } else {
            console.error('   Error:', error.message);
        }
    }
}

testN8n();
