# InboxArk Autonomous Marketing Agent

Autonomous marketing agent for inboxark.com — posts to Facebook, Instagram, and X automatically using Claude AI.

## What it does
- Generates posts using Claude AI, specific to InboxArk's product
- Auto-posts to FB + IG + X on Mon/Wed/Fri at 9am UTC
- Web dashboard to monitor activity, trigger posts manually, generate blog articles
- Self-contained — runs 24/7 on Render free tier

## Deploy to Render

### Step 1 — Push to GitHub
```bash
git init
git add .
git commit -m "InboxArk agent v1"
git remote add origin https://github.com/YOUR_USERNAME/inboxark-agent.git
git push -u origin main
```

### Step 2 — Create Render service
1. Go to render.com → New → Web Service
2. Connect your GitHub repo
3. Build command: `npm install`
4. Start command: `npm start`
5. Plan: Free

### Step 3 — Add environment variables in Render
Go to your service → Environment → Add these:

| Key | Value |
|-----|-------|
| ANTHROPIC_API_KEY | sk-ant-... (your Claude API key) |
| META_PAGE_ID | Your Facebook Page ID |
| META_ACCESS_TOKEN | Your Meta access token |
| IG_USER_ID | Your Instagram Business account ID |
| X_API_KEY | Twitter app API key |
| X_API_SECRET | Twitter app API secret |
| X_ACCESS_TOKEN | Twitter access token |
| X_ACCESS_SECRET | Twitter access secret |

Start with just ANTHROPIC_API_KEY — the agent will generate posts even without Meta/X keys.

### Step 4 — Deploy
Render auto-deploys when you push to GitHub. Your dashboard will be live at:
`https://inboxark-agent.onrender.com`

## Posting schedule
- Monday, Wednesday, Friday at 9:00 AM UTC
- Manual posts available from the dashboard anytime

## API endpoints
- `GET /health` — health check
- `GET /api/status` — connection status
- `GET /api/logs` — activity log
- `GET /api/posts` — generated posts
- `POST /api/generate` — generate a post
- `POST /api/publish` — generate + publish immediately
- `POST /api/blog` — generate blog article
