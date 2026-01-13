# W4U Writing Assistant

An AI-driven editorial assistant designed to guide authors from initial concept to a structured manuscript.

## Overview
GhostWriter AI automates the book creation process through a three-stage workflow:
1. Interview: Extracting themes and stylistic preferences.
2. Outlining: Generating a structured chapter list in JSON format.
3. Writing: Iterative content generation (in development).

## Tech Stack
*   Frontend: React, TypeScript, Vite
*   Styling: Vanilla CSS
*   Orchestration: n8n (State Machine logic)
*   Database: Supabase (PostgreSQL)
*   LLM: DeepSeek via OpenRouter

## Setup
1. Clone the repository
2. Run `npm install`
3. Configure environment variables in `.env` based on `.env.example`
4. Run `npm run dev`

## Objectives
*   Manage AI context window for long-form content.
*   Implement real-time synchronization between n8n and the frontend.
*   Automate chapter-by-chapter drafting.

---
Development project focusing on AI orchestration and state management.
