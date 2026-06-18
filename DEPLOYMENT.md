# ParkWatch Deployment Guide

## Table of Contents
1. [Local Development Setup](#local-development-setup)
2. [Docker Deployment](#docker-deployment)
3. [Cloud Deployment](#cloud-deployment)
4. [Production Checklist](#production-checklist)
5. [API Documentation](#api-documentation)
6. [Monitoring & Troubleshooting](#monitoring--troubleshooting)

---

## Local Development Setup

### Prerequisites
- Python 3.10+ (tested with 3.14)
- Node.js 18+ and npm 9+
- Git

### Step 1: Clone and Setup Backend

```bash
cd /path/to/parkwatch
python3 -m venv .venv
source .venv/bin/activate  # On Windows: .\.venv\Scripts\Activate.ps1

# Install Python dependencies
pip install --upgrade pip setuptools
pip install -r backend/requirements.txt
```

### Step 2: Prepare Data

Place your parking violations CSV file in `data/` directory:
```bash
# Rename to match expected format
mv your_violations.csv data/parking_violations.csv
```

The CSV must have these columns:
- `created_datetime`: ISO format timestamp
- `latitude`: Float coordinate
- `longitude`: Float coordinate
- `violation_type`: JSON array or string
- `device_id`: Device identifier
- `validation_status`: "approved", "rejected", or empty
- `junction_name`: Junction name or "No Junction"
- `police_station`: Station name
- `location`: Location description

### Step 3: Preprocess Data

```bash
python scripts/preprocess_official_csv.py
```

This generates JSON files in `backend/app/data/processed/`:
- `hotspots.json` - Aggregated violation hotspots
- `graph.json` - Spatial graph with nodes and edges
- `graph_edges.json` - Edge list with weights
- `forecast.json` - Weekly predictions
- `temporal.json` - Hourly and weekday patterns
- `cell_timeseries.json` - Daily violation counts
- `weekly_timeseries.json` - Weekly timeseries

### Step 4: Start Backend

```bash
# Terminal 1: Backend
cd /path/to/parkwatch
source .venv/bin/activate
PYTHONPATH=/path/to/parkwatch python -m uvicorn backend.app.main:app --reload --host 127.0.0.1 --port 8000
```

Verify health:
```bash
curl http://127.0.0.1:8000/api/health
```

### Step 5: Setup Frontend

```bash
# Terminal 2: Frontend
cd /path/to/parkwatch/frontend
npm install
npm run dev
```

Open http://127.0.0.1:3000 in your browser.

---

## Docker Deployment

### Docker Setup for Local Testing

Create `Dockerfile` in project root:

```dockerfile
# Multi-stage build
FROM python:3.14-slim as backend-stage
WORKDIR /app
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 8000
CMD ["python", "-m", "uvicorn", "backend.app.main:app", "--host", "0.0.0.0", "--port", "8000"]

FROM node:20-alpine as frontend-build
WORKDIR /app
COPY frontend/package*.json ./
RUN npm ci
COPY frontend .
RUN npm run build

FROM node:20-alpine as frontend-stage
WORKDIR /app
COPY --from=frontend-build /app/public ./public
COPY --from=frontend-build /app/.next ./.next
COPY --from=frontend-build /app/node_modules ./node_modules
COPY frontend/package.json .
EXPOSE 3000
CMD ["npm", "run", "start"]
```

Create `docker-compose.yml`:

```yaml
version: '3.8'

services:
  backend:
    build:
      context: .
      dockerfile: Dockerfile
      target: backend-stage
    ports:
      - "8000:8000"
    environment:
      - PYTHONUNBUFFERED=1
    volumes:
      - ./backend/app/data/processed:/app/backend/app/data/processed
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/api/health"]
      interval: 10s
      timeout: 5s
      retries: 3

  frontend:
    build:
      context: .
      dockerfile: Dockerfile
      target: frontend-stage
    ports:
      - "3000:3000"
    environment:
      - NEXT_PUBLIC_API_BASE_URL=http://backend:8000
    depends_on:
      - backend
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000"]
      interval: 10s
      timeout: 5s
      retries: 3
```

Run with Docker Compose:
```bash
docker-compose up --build
```

---

## Cloud Deployment

### Option 1: AWS EC2 + S3

#### 1. Launch EC2 Instance
```bash
# SSH into EC2 (Ubuntu 22.04)
ssh -i key.pem ubuntu@your-instance-ip

# Update and install dependencies
sudo apt update && sudo apt upgrade -y
sudo apt install -y python3.10-dev python3-venv nodejs npm git

# Clone repo
git clone https://github.com/your-org/parkwatch.git
cd parkwatch
```

#### 2. Upload Data to S3
```bash
aws s3 cp data/parking_violations.csv s3://your-bucket/data/
```

#### 3. Setup Backend on EC2
```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt

# Download data from S3
aws s3 cp s3://your-bucket/data/parking_violations.csv data/

# Preprocess
python scripts/preprocess_official_csv.py

# Start with Gunicorn
pip install gunicorn
gunicorn -w 4 -b 0.0.0.0:8000 backend.app.main:app
```

#### 4. Setup Frontend on EC2
```bash
cd frontend
npm install
npm run build
npm install -g pm2
pm2 start npm --name "parkwatch-frontend" -- run start
```

#### 5. Setup Nginx Reverse Proxy
```bash
sudo apt install -y nginx

# Create Nginx config
sudo tee /etc/nginx/sites-available/parkwatch > /dev/null <<EOF
upstream backend {
    server localhost:8000;
}

upstream frontend {
    server localhost:3000;
}

server {
    listen 80;
    server_name your-domain.com;

    location /api {
        proxy_pass http://backend;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
    }

    location / {
        proxy_pass http://frontend;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
    }
}
EOF

# Enable site
sudo ln -s /etc/nginx/sites-available/parkwatch /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

#### 6. Setup SSL with Let's Encrypt
```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

---

### Option 2: Heroku Deployment

#### 1. Setup Heroku
```bash
npm install -g heroku
heroku login
heroku create parkwatch-app
```

#### 2. Add Procfile
```bash
cat > Procfile <<EOF
web: gunicorn -w 4 -b 0.0.0.0:\$PORT backend.app.main:app
release: python scripts/preprocess_official_csv.py
EOF
```

#### 3. Add runtime.txt
```bash
echo "python-3.11.0" > runtime.txt
```

#### 4. Deploy
```bash
git add .
git commit -m "Deploy to Heroku"
git push heroku main

# View logs
heroku logs --tail
```

---

### Option 3: Google Cloud Run

#### 1. Build and Push Docker Image
```bash
gcloud auth configure-docker
docker build -t gcr.io/your-project/parkwatch:latest .
docker push gcr.io/your-project/parkwatch:latest
```

#### 2. Deploy Backend
```bash
gcloud run deploy parkwatch-backend \
  --image gcr.io/your-project/parkwatch:latest \
  --platform managed \
  --region us-central1 \
  --memory 2Gi \
  --timeout 3600
```

#### 3. Deploy Frontend
```bash
gcloud run deploy parkwatch-frontend \
  --image gcr.io/your-project/parkwatch-frontend:latest \
  --platform managed \
  --region us-central1 \
  --set-env-vars NEXT_PUBLIC_API_BASE_URL=https://parkwatch-backend-xxxxx.a.run.app
```

---

## Production Checklist

- [ ] Data preprocessing completed and verified
- [ ] Backend healthcheck endpoint responding
- [ ] Frontend build successful (`npm run build`)
- [ ] Environment variables set (.env.production)
- [ ] SSL/TLS certificate installed
- [ ] Database backups configured
- [ ] Logging and monitoring enabled
- [ ] Rate limiting configured
- [ ] CORS properly configured
- [ ] Data retention policy defined
- [ ] Security headers configured
- [ ] Load testing completed

### Environment Variables (.env.production)

```bash
# Backend
PYTHONUNBUFFERED=1
DATA_DIR=/app/backend/app/data/processed
LOG_LEVEL=info

# Frontend
NEXT_PUBLIC_API_BASE_URL=https://api.parkwatch.app
NEXT_PUBLIC_ENVIRONMENT=production
NEXT_PUBLIC_GA_ID=your-google-analytics-id  # Optional
```

---

## API Documentation

### Health Check
```http
GET /api/health
```
Response: `{"status": "ok", "data_ready": true}`

### Summary Statistics
```http
GET /api/summary
```
Response includes: hotspot_count, edge_count, station_count, total_violations

### List Hotspots
```http
GET /api/hotspots?limit=100&station=Upparpet&confidence=High
```

### Get Hotspot Details
```http
GET /api/hotspots/{cell_id}
```

### Get Timeseries
```http
GET /api/timeseries/{cell_id}
GET /api/timeseries/{cell_id}/weekly
```

### Get Temporal Patterns
```http
GET /api/temporal/hourly
GET /api/temporal/weekday
GET /api/temporal/heatmap
```

### Get Stations
```http
GET /api/stations
```

### Get Graph Edges
```http
GET /api/graph/{cell_id}
```

### Get Forecast
```http
GET /api/forecast?weeks=4
```

---

## Monitoring & Troubleshooting

### Check Backend Status
```bash
curl http://localhost:8000/api/health -v
```

### View Logs
```bash
# Docker
docker-compose logs -f backend

# PM2
pm2 logs parkwatch-backend

# Systemd
sudo journalctl -u parkwatch-backend -f
```

### Common Issues

**Issue: "No data available"**
```bash
# Verify data preprocessing
ls -lh backend/app/data/processed/
# Should see 8 JSON files

# Re-run preprocessing
python scripts/preprocess_official_csv.py
```

**Issue: "Connection refused" on frontend**
```bash
# Check backend is running
curl http://127.0.0.1:8000/api/health

# Update NEXT_PUBLIC_API_BASE_URL in .env.local
echo "NEXT_PUBLIC_API_BASE_URL=http://localhost:8000" > frontend/.env.local
npm run dev
```

**Issue: "ModuleNotFoundError: backend"**
```bash
# Set PYTHONPATH
export PYTHONPATH=/path/to/parkwatch:$PYTHONPATH
python -m uvicorn backend.app.main:app
```

### Performance Tuning

**Backend (uvicorn)**
```bash
# Increase workers for high load
python -m uvicorn backend.app.main:app --workers 8 --host 0.0.0.0 --port 8000
```

**Frontend (Next.js)**
```bash
# Enable ISR (Incremental Static Regeneration)
# Edit next.config.ts to add revalidate: 3600
```

**Database caching (if using PostGIS)**
```sql
CREATE INDEX idx_hotspots_score ON hotspots(obstruction_risk_score DESC);
CREATE INDEX idx_hotspots_station ON hotspots(dominant_station);
```

---

## Support

For issues or questions:
- GitHub: https://github.com/your-org/parkwatch
- Documentation: https://parkwatch.readthedocs.io
- Issues: https://github.com/your-org/parkwatch/issues

## License

See LICENSE file in repository root.
