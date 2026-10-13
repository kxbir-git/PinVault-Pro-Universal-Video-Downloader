# 🚀 PinVault Pro Deployment Guide

Universal Video Downloader & Converter Stack:
- **Frontend**: Next.js 16 (React 19)
- **Backend API**: Node.js / Express + PostgreSQL + Redis
- **Worker / Downloader**: Python 3.11 FastAPI + yt-dlp + ffmpeg

---

## ⚡ Option 1: Free Cloud Deployment (Vercel + Render / Railway)

### 1. Frontend on Vercel (Free)
1. Go to [vercel.com](https://vercel.com) and sign in with GitHub.
2. Click **"Add New Project"** and select `kxbir-git/PinVault-Pro---Universal-Video-Downloader`.
3. In **Project Settings**:
   - **Root Directory**: Select `frontend`
   - **Framework Preset**: `Next.js`
4. Add **Environment Variables**:
   - `NEXT_PUBLIC_API_URL` = `https://your-backend-api.onrender.com` (or your backend URL)
5. Click **Deploy**. Done! Your frontend is live with SSL.

---

### 2. Python Service on Render (Free)
1. Go to [render.com](https://render.com) and create a **Web Service**.
2. Connect your GitHub repository: `kxbir-git/PinVault-Pro---Universal-Video-Downloader`.
3. Configure settings:
   - **Root Directory**: `python-service`
   - **Environment**: `Docker` (or `Python 3`)
   - **Build Command** (if Python): `pip install -r requirements.txt`
   - **Start Command**: `uvicorn main:app --host 0.0.0.0 --port $PORT`
4. Deploy the service and copy the provided public URL.

---

### 3. Backend API on Render (Free)
1. Create a **Web Service** on Render for `backend-api`.
2. Create a free **PostgreSQL Database** and **Redis Instance** on Render or Upstash.
3. Configure settings:
   - **Root Directory**: `backend-api`
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
4. Add Environment Variables:
   - `DATABASE_URL` = `postgres://...`
   - `REDIS_URL` = `redis://...`
   - `PYTHON_SERVICE_URL` = `https://your-python-service.onrender.com`
   - `JWT_SECRET` = `<any-random-string>`

---

## 🐳 Option 2: 1-Click VPS Deployment (Docker Compose)

Deploy everything on a single Ubuntu / Linux VPS (DigitalOcean, AWS, Hetzner, Linode):

### 1. Clone & Setup
```bash
git clone https://github.com/kxbir-git/PinVault-Pro---Universal-Video-Downloader.git
cd PinVault-Pro---Universal-Video-Downloader
cp .env.example .env
```

### 2. Edit `.env` with your domain/secrets
```bash
nano .env
```

### 3. Start All Services
```bash
docker compose up -d --build
```

Your entire stack (Postgres, Redis, Backend API, Python Worker, Next.js Frontend, Nginx) will start up automatically.
