// Vercel serverless entry point
// This file must be .js (not .cjs) for Vercel to recognize it as a serverless function
const app = require("../server/index.cjs");

module.exports = app;
