# Voice AI Agent — Full End-to-End Architecture

> React + Python FastAPI + Supabase + Deepgram + ElevenLabs + RAG

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Authentication Flow](#2-authentication-flow)
3. [Voice Pipeline](#3-voice-pipeline)
4. [RAG + Document Pipeline](#4-rag--document-pipeline)
5. [Memory and History](#5-memory-and-history)
6. [Database Schema](#6-database-schema)
7. [Error Handling](#7-error-handling)
8. [Concurrency](#8-concurrency)
9. [Auto Document Ingestion](#9-auto-document-ingestion)
10. [Deployment](#10-deployment)
11. [Environment Variables](#11-environment-variables)
12. [File Structure](#12-file-structure)

---

## 1. System Overview

Three layers. Everything in Python on the backend, React on the frontend, Supabase for all data.

```
┌─────────────────────────────────────────────────────────────┐
│                  FRONTEND — React (Vercel)                   │
│  Auth pages │ Voice UI │ Chat history │ Mic permission       │
└─────────────────────────┬───────────────────────────────────┘
                          │ HTTPS + WSS
┌─────────────────────────▼───────────────────────────────────┐
│              BACKEND — Python FastAPI (Railway)              │
│  Auth API │ WebSocket │ RAG engine │ Doc processor           │
│  Repositories │ Services │ Connection manager               │
└──────┬──────────┬──────────┬──────────┬──────────┬──────────┘
       │          │          │          │          │
  Supabase   Supabase    pgvector   Deepgram  ElevenLabs
   Auth      Postgres    (vectors)   (STT)      (TTS)
```

### What each layer does

**Frontend (React)**
- Auth pages: sign in, sign up, email confirmation
- Voice UI: mic button, waveform, status indicator
- Chat history: past conversations
- Mic permission: getUserMedia with all error states handled
- WebSocket client: sends audio chunks, receives audio back

**Backend (FastAPI)**
- Auth API: signup, signin, refresh token, JWT verification
- WebSocket server: one connection per user, asyncio concurrent
- RAG engine: embed query, pgvector search, context retrieval
- Doc processor: parse .md, chunk by heading, embed, save
- Webhook handler: triggered automatically on new file upload
- Repository layer: all DB logic in one place per table

**Data + External APIs**
- Supabase Auth: user accounts, JWT tokens, email confirmation — passwords hashed automatically
- Supabase Postgres: messages, conversations, user_memory tables
- Supabase pgvector: document chunks stored as 1536-dim vectors
- Supabase Storage: raw .md files (S3-compatible bucket)
- Deepgram API: speech-to-text — audio bytes in, transcript text out
- ElevenLabs API: text-to-speech — text in, audio bytes out
- OpenAI Embeddings API: text to vector numbers for RAG search

---

## 2. Authentication Flow

Supabase handles all the hard parts. Passwords are bcrypt-hashed automatically. Email confirmation uses JWT tokens sent by Supabase. Your FastAPI only verifies the JWT on every request — no extra DB call needed.

### Sign Up Flow

```
User submits email + password
        ↓
React → POST /auth/signup → FastAPI
        ↓
FastAPI → Supabase /auth/v1/signup
        ↓
Supabase hashes password (bcrypt, automatic)
Supabase sends confirmation email with JWT link
        ↓
Supabase returns access_token + refresh_token
        ↓
FastAPI returns tokens to React
        ↓
React stores:
  access_token  → sessionStorage (safe, tab-scoped)
  refresh_token → localStorage (survives new tabs)
```

### Sign In Flow

```
User enters email + password
        ↓
React → POST /auth/signin → FastAPI
        ↓
FastAPI → Supabase /auth/v1/token?grant_type=password
        ↓
Supabase verifies password → returns JWT
        ↓
React stores tokens (same as above)
        ↓
Every protected request:
  Authorization: Bearer <access_token>
        ↓
FastAPI verifies JWT locally using SUPABASE_JWT_SECRET
No DB call — just fast local crypto check
```

### Token Refresh

Access tokens expire after 1 hour. On page load React checks the token. If expired, it silently calls `POST /auth/refresh` with the refresh_token and gets a new access_token. User never has to log in again unless they explicitly sign out.

---

## 3. Voice Pipeline

No telephony. No PSTN. Pure browser WebRTC. User clicks a button, grants mic permission, talks directly to the agent over WebSocket.

### Mic Permission

```javascript
// React calls this one line
const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
```

Browser shows native popup. Four outcomes handled:

| Outcome | Error | Handling |
|---|---|---|
| Allowed | none | mic stream starts, WebSocket connects |
| Blocked | NotAllowedError | show browser settings instructions |
| No mic | NotFoundError | show "no microphone detected" |
| Mic in use | NotReadableError | show "close other apps using mic" |

### Full Voice Turn

```
1. Mic stream active
   └─ getUserMedia returns stream
   └─ Silero VAD starts monitoring continuously

2. VAD detects speech
   └─ User starts speaking
   └─ State = LISTENING

3. VAD detects end of speech
   └─ User goes silent for ~800ms
   └─ Audio chunks buffered and sent over WebSocket to FastAPI

4. Deepgram STT
   └─ FastAPI sends audio bytes to Deepgram API
   └─ Transcript returned within ~300ms
   └─ If nothing returned in 8s → timeout → ask user to repeat

5. Save user message
   └─ messages table: role=user, content=transcript, timestamp=now

6. RAG search
   └─ Transcript embedded via OpenAI Embeddings
   └─ pgvector finds top 3 most similar document chunks

7. LLM called
   └─ Receives: long-term memory + session history + RAG chunks + transcript
   └─ Generates answer

8. Save assistant message
   └─ messages table: role=assistant, content=answer, timestamp=now

9. ElevenLabs TTS
   └─ Answer text sent to ElevenLabs API
   └─ Audio bytes stream back to FastAPI

10. Audio plays in browser
    └─ FastAPI streams audio chunks back over WebSocket
    └─ Browser plays audio
    └─ State = SPEAKING

↻ Back to step 1 when audio finishes
```

### Barge-In (Interruption Handling)

While AI is speaking (state = SPEAKING), VAD is still running on the mic. If the user speaks above the sensitivity threshold:

```
User speaks while AI is playing audio
        ↓
VAD confidence > BARGE_IN_SENSITIVITY threshold?
        ↓ YES
Cancel ElevenLabs stream immediately
Send stop_audio message to browser
Browser stops playback
State = LISTENING
        ↓
Process user's new audio from step 3
```

**Sensitivity** is a float `0.0` to `1.0` set in `.env`:
- `0.2` — must speak loudly/clearly to interrupt
- `0.5` — default, balanced
- `0.8` — any small sound interrupts AI

### Conversation States

```
LISTENING   → mic active, VAD watching, waiting for speech
PROCESSING  → audio sent to Deepgram + LLM running
SPEAKING    → ElevenLabs audio playing, barge-in watching
```

---

## 4. RAG + Document Pipeline

RAG (Retrieval Augmented Generation) — instead of the LLM answering from its training data, it first searches your uploaded documents and answers based on what it finds.

### Document Ingestion (Automatic on Every Upload)

```
Admin uploads refund-policy.md to Supabase Storage
        ↓
Supabase fires webhook → POST /webhook/new-document on FastAPI
(configured once in Supabase dashboard, runs forever)
        ↓
FastAPI downloads .md file bytes from Storage
        ↓
mistune parses .md into AST (Abstract Syntax Tree)
  - Tables → "Header: value. Header: value." sentences
  - Headings → section labels
  - Lists → preserved as items
  - Links → display text only, URLs stripped
        ↓
Chunk by heading (## splits)
  Each heading = one chunk with section_title preserved
  Example:
    chunk 1: section_title="Reset your password", chunk_text="Reset your password. If you forgot..."
    chunk 2: section_title="Two-factor authentication", chunk_text="2FA. Lumen supports TOTP..."
        ↓
Each chunk → OpenAI text-embedding-3-small → float[1536] vector
        ↓
INSERT into documents table:
  file_name, section_title, chunk_text, vector
        ↓
Available for RAG search immediately
```

### Query-Time RAG (Every Voice Turn)

```
Transcript arrives from Deepgram
  "what is the refund policy"
        ↓
OpenAI Embeddings → query vector [0.23, 0.81, 0.45 ...]
        ↓
pgvector cosine similarity search on documents table
        ↓
Top 3 most similar chunks returned:
  chunk: "Refunds are processed within 7 days..."
  chunk: "Customer must provide order number..."
  chunk: "Refunds go back to original payment method..."
        ↓
Build LLM prompt:
  system: <long-term memory>
  history: <today's messages>
  context: <top 3 chunks>
  question: "what is the refund policy"
        ↓
LLM answers based on your actual documents
```

### Why Chunk by Heading

Chunking by `##` heading preserves document structure. Each chunk is one complete topic. When a user asks about a feature, the retrieved chunk has all the relevant information — not half a sentence cut off at a word boundary.

---

## 5. Memory and History

Two types of memory so users never have to repeat themselves across sessions.

### Short-Term Memory (Current Session)

Every message saved to `messages` table in real time. At each LLM call, the full current session history is loaded and passed to the LLM. The LLM sees the complete thread from the start of this session.

### Long-Term Memory (Across Sessions)

When a WebSocket session ends (user disconnects), a background task runs:

```
Fetch all messages from this session
        ↓
Load existing user_memory summary (if any)
        ↓
LLM prompt:
  "Previous memory: <existing summary>
   New conversation: <session messages>
   Write a concise updated summary under 200 words."
        ↓
Upsert to user_memory table
  (one row per user, updated each session)
```

Next time the user connects — even 2 days later — their memory summary is injected into the system prompt. The AI knows who they are and what they talked about before.

### Memory Trigger

Summary is generated on both:
- WebSocket disconnect (clean close)
- Every 10 messages during a session (in case browser tab is closed abruptly)

### What LLM Receives Every Turn

```
SYSTEM PROMPT:
  Long-term memory from user_memory table
  "User previously asked about cancelling enterprise plan.
   Concerned about losing data. Issue resolved on Day 1."

SESSION HISTORY:
  All messages from today's conversation
  user: "hey I'm back"
  assistant: "Welcome back! How can I help?"

RAG CONTEXT:
  Top 3 chunks from pgvector search
  "Enterprise cancellation policy: ..."

CURRENT QUESTION:
  Transcript from Deepgram
  "what was I asking about last time?"
```

---

## 6. Database Schema

All data in Supabase Postgres. Run this SQL in Supabase SQL Editor before starting.

```sql
-- Enable pgvector (once)
create extension if not exists vector;

-- Conversations (one per session)
create table conversations (
    id          uuid default gen_random_uuid() primary key,
    user_id     uuid references auth.users(id),
    title       text,
    created_at  timestamp default now()
);

-- Messages (every single message)
create table messages (
    id              uuid default gen_random_uuid() primary key,
    conversation_id uuid references conversations(id),
    user_id         uuid references auth.users(id),
    role            text,        -- 'user' or 'assistant'
    content         text,        -- transcript or AI reply
    created_at      timestamp default now()
);

-- Documents (chunks + vectors for RAG)
create table documents (
    id            uuid default gen_random_uuid() primary key,
    file_name     text,          -- e.g. refund-policy.md
    section_title text,          -- heading of the chunk
    chunk_text    text,          -- clean plain text
    vector        vector(1536),  -- OpenAI embedding
    created_at    timestamp default now()
);

-- Vector search index (for fast similarity search)
create index on documents
using ivfflat (vector vector_cosine_ops)
with (lists = 100);

-- User memory (long-term memory, one row per user)
create table user_memory (
    id         uuid default gen_random_uuid() primary key,
    user_id    uuid references auth.users(id) unique,
    summary    text,             -- LLM-generated summary
    updated_at timestamp default now()
);

-- Storage bucket for raw .md files
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false);
```

### Schema relationships

```
auth.users
    │
    ├── conversations (user_id FK)
    │       │
    │       └── messages (conversation_id FK)
    │
    ├── user_memory (user_id FK, unique — one row per user)
    │
    └── messages (user_id FK)

documents (standalone — no FK to users, searchable by anyone)
```

---

## 7. Error Handling

Every error caught. Server never crashes. User always gets a clear message or silent recovery.

| Error | Detection | Recovery |
|---|---|---|
| Mic blocked | NotAllowedError | Show browser settings instructions. Never retry — user must fix. |
| No mic found | NotFoundError | Show "no microphone detected". |
| Mic in use | NotReadableError | Show "close other apps using mic". |
| WS fails to start | Connection refused | Retry 3 times: wait 1s, 2s, 4s. Then show error. |
| WS drops mid-call | onclose event | Auto-reconnect silently with same conversation_id. History preserved. |
| No transcript | 8s timeout | Ask user to repeat. Reset state to LISTENING. |
| LLM timeout | 10s timeout | Send fallback text message. Reset to LISTENING. |
| ElevenLabs fails | API error | Log error. Send text reply as fallback so user still gets answer. |
| Unexpected exception | try/except | Log it. Reset state. Keep WebSocket connection alive for other users. |

### Global WebSocket Error Wrapper (Python)

```python
@app.websocket("/ws/{user_id}")
async def websocket_endpoint(websocket: WebSocket, user_id: str):
    await websocket.accept()
    try:
        while True:
            try:
                audio = await websocket.receive_bytes()
                await process_turn(websocket, user_id, audio)
            except Exception as e:
                # pipeline error — log but keep connection alive
                print(f"Pipeline error for {user_id}: {e}")
                await websocket.send_json({
                    "type": "error",
                    "message": "Something went wrong, please try again"
                })
                session.state = "LISTENING"
    except WebSocketDisconnect:
        manager.disconnect(user_id)
        asyncio.create_task(summarize_and_save(user_id, conversation_id))
```

---

## 8. Concurrency — Multiple Users

FastAPI runs on asyncio. Handles thousands of concurrent WebSocket connections in a single process. No threads needed for I/O bound work.

### Why No Threading Needed

Our pipeline spends most time waiting (not computing):
- Send audio to Deepgram → wait ~300ms
- Send text to LLM → wait ~500ms
- Send text to ElevenLabs → wait ~200ms

While User 1 waits for Deepgram, asyncio serves User 2. One event loop, zero threads, full concurrency.

### The One Exception — Silero VAD

VAD is CPU-heavy (not I/O). It runs in a threadpool so it never blocks the event loop:

```python
result = await asyncio.get_event_loop().run_in_executor(
    None,        # default threadpool
    silero_vad,  # the blocking function
    audio_chunk  # argument
)
```

### User Isolation

Each user has their own:
- WebSocket connection (private channel — send goes only to them)
- `UserSession` object with state, sensitivity, conversation_id
- Isolated LLM call with their own history and memory

```
User 1 → WebSocket A → Session(state=LISTENING)  → LLM(history of user 1) → WebSocket A → User 1
User 2 → WebSocket B → Session(state=SPEAKING)   → LLM(history of user 2) → WebSocket B → User 2
User 3 → WebSocket C → Session(state=PROCESSING) → LLM(history of user 3) → WebSocket C → User 3
```

### Connection Manager

```python
class ConnectionManager:
    def __init__(self):
        self.active: dict[str, WebSocket] = {}

    async def connect(self, user_id: str, websocket: WebSocket):
        if len(self.active) >= MAX_CONCURRENT_USERS:
            await websocket.close(code=1008, reason="Server full")
            return
        await websocket.accept()
        self.active[user_id] = websocket

    def disconnect(self, user_id: str):
        self.active.pop(user_id, None)
```

---

## 9. Auto Document Ingestion

Upload a `.md` file → everything happens automatically. No manual steps ever.

### One-Time Setup

In Supabase dashboard:
- Go to **Storage → Webhooks**
- Create webhook: on `INSERT` event → `POST` to `https://your-api.railway.app/webhook/new-document`

Done. Runs forever.

### What Happens on Every Upload

```
Upload refund-policy.md to Supabase Storage (documents bucket)
        ↓
Supabase fires POST /webhook/new-document
  payload: { "name": "refund-policy.md" }
        ↓
FastAPI downloads file from Storage
        ↓
mistune parses .md AST:
  Tables   → "Topic: Sign in. Content: Sign in with existing account."
  Headings → "Section: Sign in and registration"
  Lists    → "- First name\n- Last name"
        ↓
Split at ## headings → N chunks
  Each chunk has: file_name, section_title, chunk_text
        ↓
Each chunk → OpenAI text-embedding-3-small → vector[1536]
        ↓
INSERT into documents table
        ↓
Available for RAG immediately
```

---

## 10. Deployment

| What | Platform | Cost |
|---|---|---|
| Frontend (React) | Vercel | Free |
| Backend (FastAPI) | Railway | $5 free credit |
| Database + Auth | Supabase | Free tier |
| STT | Deepgram | $200 free credit |
| TTS | ElevenLabs | 10k chars/month free |
| Embeddings | OpenAI | ~$0.02 per 1M tokens |

### HTTPS Requirement

`getUserMedia` (mic permission) only works on HTTPS. Vercel and Railway both provide automatic HTTPS certificates for free. Never deploy voice features on plain HTTP.

### Steps

**Backend (Railway):**
1. Push backend code to GitHub
2. railway.app → New Project → Deploy from GitHub
3. Add environment variables in Railway dashboard
4. Railway gives you: `https://your-backend.railway.app`

**Frontend (Vercel):**
1. Push frontend code to GitHub
2. vercel.com → New Project → Import from GitHub
3. Set `VITE_API_URL=https://your-backend.railway.app`
4. Vercel gives you: `https://your-app.vercel.app`

---

## 11. Environment Variables

### Backend `.env`

```bash
# Supabase — Project Settings → API
SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_JWT_SECRET=your-jwt-secret   # Settings → API → JWT Secret

# External APIs
DEEPGRAM_API_KEY=your-deepgram-key    # console.deepgram.com → API Keys
ELEVENLABS_API_KEY=your-elevenlabs-key # elevenlabs.io → Profile → API Key
OPENAI_API_KEY=your-openai-key        # platform.openai.com → API Keys

# App config
FRONTEND_URL=https://your-app.vercel.app
MAX_CONCURRENT_USERS=50
BARGE_IN_SENSITIVITY=0.5              # 0.0 to 1.0
TRANSCRIPT_TIMEOUT_SECONDS=8
LLM_TIMEOUT_SECONDS=10
```

### Frontend `.env`

```bash
VITE_API_URL=https://your-backend.railway.app
```

---

## 12. File Structure

```
voice-agent/
│
├── backend/
│   ├── main.py                      # FastAPI app — all routes, WebSocket, webhooks
│   ├── auth.py                      # JWT verification dependency
│   ├── database.py                  # Single Supabase client (created once, reused)
│   ├── md_extractor.py              # mistune AST parser — tables preserved
│   ├── doc_processor.py             # chunk + embed + save pipeline
│   ├── websocket_manager.py         # ConnectionManager + UserSession + barge-in
│   ├── requirements.txt
│   ├── .env.example
│   │
│   ├── repositories/                # All DB logic — one file per table
│   │   ├── message_repo.py          # save_message(), get_conversation_history()
│   │   ├── conversation_repo.py     # create_conversation(), get_conversations()
│   │   ├── document_repo.py         # save_chunk(), vector_search()
│   │   └── memory_repo.py           # get_user_memory(), upsert_user_memory()
│   │
│   └── services/                    # External API wrappers
│       ├── deepgram_service.py      # STT with 8s timeout
│       ├── elevenlabs_service.py    # TTS streaming with cancel support
│       ├── llm_service.py           # LLM call with memory + RAG context builder
│       ├── rag_service.py           # embed_query() + pgvector_search()
│       └── vad_service.py           # Silero VAD + barge-in threshold
│
└── frontend/
    ├── index.html
    ├── vite.config.ts
    ├── tsconfig.json
    ├── package.json
    ├── .env.example
    │
    └── src/
        ├── main.tsx                 # Vite entry point
        ├── App.tsx                  # Routes to AuthPage or Dashboard
        ├── index.css                # Global styles + CSS variables
        │
        ├── contexts/
        │   └── AuthContext.tsx      # JWT state, auto-refresh, signIn, signUp, signOut
        │
        ├── pages/
        │   ├── AuthPage.tsx         # Sign in / sign up with error handling
        │   └── Dashboard.tsx        # Voice interface — mic button, status, history
        │
        └── hooks/
            ├── useMic.ts            # getUserMedia + all 4 error states
            └── useWebSocket.ts      # WebSocket + auto-reconnect + retry logic
```

---

## Quick Reference

### API Routes

| Method | Route | Description |
|---|---|---|
| POST | `/auth/signup` | Register new user |
| POST | `/auth/signin` | Login, returns JWT |
| POST | `/auth/refresh` | Refresh expired token |
| POST | `/auth/signout` | Logout |
| GET | `/api/me` | Get current user (protected) |
| WS | `/ws/{user_id}` | Voice WebSocket connection |
| POST | `/webhook/new-document` | Called by Supabase on file upload |
| GET | `/api/conversations` | Get user's conversation list |
| GET | `/api/conversations/{id}/messages` | Get messages for a conversation |

### Technology Decisions

| Decision | Choice | Why |
|---|---|---|
| Voice approach | Self-orchestrated | Full control, cheaper, defensible |
| STT | Deepgram | Low latency, $200 free credit, streaming |
| TTS | ElevenLabs | Best voice quality |
| LLM | Claude / GPT-4o | Best reasoning |
| Vector DB | pgvector (Supabase) | No separate service needed |
| Embeddings | OpenAI text-embedding-3-small | Cheap, accurate, 1536 dims |
| VAD | Silero | Free, runs locally, no API cost |
| Auth | Supabase Auth | Free, handles hashing + email + JWT |
| Backend | FastAPI + asyncio | Async WebSocket, Python ecosystem |
| Frontend | React + Vite + TypeScript | Fast, typed, industry standard |
| Deployment | Railway + Vercel | Easiest Python + React deployment |
