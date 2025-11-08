# Deployment Guide

## Overview

This guide covers deploying a production-ready Solid.js reactive application with SSR, monitoring, and zero-downtime deployment.

## Prerequisites

- Node.js 18+ installed
- Git repository
- CI/CD platform (GitHub Actions, GitLab CI, etc.)
- Hosting platform (Vercel, Netlify, VPS, etc.)
- Domain name (optional but recommended)

## Build Configuration

### Production Build Script

```json
{
  "scripts": {
    "build": "vite build",
    "build:prod": "NODE_ENV=production vite build",
    "build:analyze": "vite-bundle-visualizer",
    "preview": "vite preview"
  }
}
```

### Vite Configuration

```javascript
// vite.config.production.js
import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';
import compression from 'vite-plugin-compression';

export default defineConfig({
  plugins: [
    solid({ ssr: true }),
    compression({
      algorithm: 'brotliCompress',
      ext: '.br'
    })
  ],
  
  build: {
    target: 'es2020',
    outDir: 'dist',
    assetsDir: 'assets',
    
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
        pure_funcs: ['console.log']
      }
    },
    
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes('node_modules')) {
            if (id.includes('solid-js')) return 'vendor-solid';
            if (id.includes('@solidjs')) return 'vendor-solidjs';
            return 'vendor';
          }
        },
        
        assetFileNames: (assetInfo) => {
          let extType = assetInfo.name.split('.')[1];
          if (/png|jpe?g|svg|gif|tiff|bmp|ico/i.test(extType)) {
            extType = 'images';
          } else if (/woff|woff2/.test(extType)) {
            extType = 'fonts';
          }
          return `assets/${extType}/[name].[hash][extname]`;
        },
        
        chunkFileNames: 'assets/js/[name].[hash].js',
        entryFileNames: 'assets/js/[name].[hash].js'
      }
    },
    
    sourcemap: true,
    reportCompressedSize: false
  },
  
  define: {
    'import.meta.env.API_URL': JSON.stringify(process.env.API_URL),
    'import.meta.env.VERSION': JSON.stringify(process.env.npm_package_version)
  }
});
```

## Environment Configuration

### Environment Files

```bash
# .env.production
NODE_ENV=production
VITE_API_URL=https://api.production.com
VITE_ERROR_TRACKING_URL=https://errors.example.com
VITE_ANALYTICS_ID=UA-XXXXX-X

# .env.staging
NODE_ENV=staging
VITE_API_URL=https://api.staging.com
VITE_ERROR_TRACKING_URL=https://errors.staging.com
VITE_ANALYTICS_ID=UA-XXXXX-X-STAGING
```

### Configuration Loading

```javascript
// config/index.js
const configs = {
  development: {
    apiUrl: 'http://localhost:3000',
    debug: true,
    errorTracking: false
  },
  
  staging: {
    apiUrl: process.env.VITE_API_URL,
    debug: true,
    errorTracking: true
  },
  
  production: {
    apiUrl: process.env.VITE_API_URL,
    debug: false,
    errorTracking: true
  }
};

export const config = configs[import.meta.env.MODE] || configs.production;
```

## Server Setup

### Express Server with SSR

```javascript
// server/index.js
import express from 'express';
import compression from 'compression';
import { renderToString } from 'solid-js/web';
import { App } from './App';

const app = express();

// Middleware
app.use(compression());
app.use(express.static('dist/client'));

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// SSR
app.get('*', async (req, res) => {
  try {
    const html = renderToString(() => <App url={req.url} />);
    
    res.send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>My App</title>
        <link rel="stylesheet" href="/assets/style.css">
      </head>
      <body>
        <div id="app">${html}</div>
        <script type="module" src="/assets/entry-client.js"></script>
      </body>
      </html>
    `);
  } catch (err) {
    console.error('SSR Error:', err);
    res.status(500).send('Internal Server Error');
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
```

## CI/CD Pipeline

### GitHub Actions

```yaml
# .github/workflows/deploy.yml
name: Deploy

on:
  push:
    branches: [main, staging]

env:
  NODE_VERSION: '18'

jobs:
  test:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node
        uses: actions/setup-node@v3
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'
      
      - name: Install
        run: npm ci
      
      - name: Lint
        run: npm run lint
      
      - name: Type Check
        run: npm run type-check
      
      - name: Test
        run: npm test -- --coverage
      
      - name: Upload Coverage
        uses: codecov/codecov-action@v3
  
  build:
    needs: test
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node
        uses: actions/setup-node@v3
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'
      
      - name: Install
        run: npm ci
      
      - name: Build
        run: npm run build:prod
        env:
          VITE_API_URL: ${{ secrets.API_URL }}
      
      - name: Upload Artifacts
        uses: actions/upload-artifact@v3
        with:
          name: dist
          path: dist/
  
  deploy-staging:
    if: github.ref == 'refs/heads/staging'
    needs: build
    runs-on: ubuntu-latest
    environment: staging
    
    steps:
      - uses: actions/download-artifact@v3
        with:
          name: dist
      
      - name: Deploy to Staging
        run: |
          # Your deployment commands
          echo "Deploying to staging..."
  
  deploy-production:
    if: github.ref == 'refs/heads/main'
    needs: build
    runs-on: ubuntu-latest
    environment: production
    
    steps:
      - uses: actions/download-artifact@v3
        with:
          name: dist
      
      - name: Deploy to Production
        run: |
          # Your deployment commands
          echo "Deploying to production..."
      
      - name: Health Check
        run: |
          sleep 10
          curl -f https://your-app.com/health || exit 1
      
      - name: Notify Team
        if: always()
        uses: 8398a7/action-slack@v3
        with:
          status: ${{ job.status }}
          webhook_url: ${{ secrets.SLACK_WEBHOOK }}
```

## Deployment Strategies

### 1. Vercel Deployment

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel --prod
```

**vercel.json:**

```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "framework": "vite",
  "env": {
    "VITE_API_URL": "@api-url"
  }
}
```

### 2. Netlify Deployment

**netlify.toml:**

```toml
[build]
  command = "npm run build"
  publish = "dist"

[build.environment]
  NODE_VERSION = "18"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200

[[headers]]
  for = "/*"
  [headers.values]
    X-Frame-Options = "DENY"
    X-Content-Type-Options = "nosniff"
    Referrer-Policy = "strict-origin-when-cross-origin"
```

### 3. Docker Deployment

**Dockerfile:**

```dockerfile
# Build stage
FROM node:18-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Production stage
FROM node:18-alpine

WORKDIR /app

COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
COPY --from=build /app/package*.json ./

RUN npm ci --production

EXPOSE 3000

CMD ["node", "server/index.js"]
```

**docker-compose.yml:**

```yaml
version: '3.8'

services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - API_URL=${API_URL}
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
```

### 4. VPS Deployment with PM2

```bash
# Install PM2
npm install -g pm2

# Start application
pm2 start server/index.js --name my-app

# Save configuration
pm2 save

# Setup startup script
pm2 startup
```

**ecosystem.config.js:**

```javascript
module.exports = {
  apps: [{
    name: 'my-app',
    script: './server/index.js',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm Z',
    merge_logs: true
  }]
};
```

## Nginx Configuration

```nginx
# /etc/nginx/sites-available/my-app

upstream app {
  server localhost:3000;
  server localhost:3001;
  server localhost:3002;
}

server {
  listen 80;
  server_name example.com;
  
  # Redirect to HTTPS
  return 301 https://$server_name$request_uri;
}

server {
  listen 443 ssl http2;
  server_name example.com;
  
  # SSL Configuration
  ssl_certificate /etc/letsencrypt/live/example.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;
  
  # Security headers
  add_header X-Frame-Options "SAMEORIGIN" always;
  add_header X-Content-Type-Options "nosniff" always;
  add_header X-XSS-Protection "1; mode=block" always;
  
  # Gzip
  gzip on;
  gzip_vary on;
  gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;
  
  # Static assets
  location /assets {
    root /var/www/my-app/dist;
    expires 1y;
    add_header Cache-Control "public, immutable";
  }
  
  # Proxy to Node.js
  location / {
    proxy_pass http://app;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_cache_bypass $http_upgrade;
  }
}
```

## Monitoring and Logging

### Application Monitoring

```javascript
// monitoring/index.js
import { performance } from 'perf_hooks';

class ApplicationMonitor {
  constructor() {
    this.metrics = {
      requests: 0,
      errors: 0,
      latency: []
    };
  }
  
  middleware() {
    return (req, res, next) => {
      const start = performance.now();
      
      res.on('finish', () => {
        const duration = performance.now() - start;
        
        this.metrics.requests++;
        this.metrics.latency.push(duration);
        
        if (res.statusCode >= 400) {
          this.metrics.errors++;
        }
        
        // Log slow requests
        if (duration > 1000) {
          console.warn(`Slow request: ${req.method} ${req.url} - ${duration}ms`);
        }
      });
      
      next();
    };
  }
  
  getMetrics() {
    const latencySum = this.metrics.latency.reduce((a, b) => a + b, 0);
    const avgLatency = latencySum / this.metrics.latency.length;
    
    return {
      requests: this.metrics.requests,
      errors: this.metrics.errors,
      errorRate: (this.metrics.errors / this.metrics.requests) * 100,
      avgLatency: avgLatency.toFixed(2),
      uptime: process.uptime()
    };
  }
}

export const monitor = new ApplicationMonitor();

// Use in Express
app.use(monitor.middleware());

// Metrics endpoint
app.get('/metrics', (req, res) => {
  res.json(monitor.getMetrics());
});
```

### Logging

```javascript
// utils/logger.js
import winston from 'winston';

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: {
    service: 'my-app',
    environment: process.env.NODE_ENV
  },
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' })
  ]
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple()
  }));
}

export default logger;
```

## Rollback Strategy

### Quick Rollback

```bash
# Tag release
git tag -a v1.0.0 -m "Release 1.0.0"
git push origin v1.0.0

# Rollback to previous version
git checkout v0.9.0
npm run build
pm2 restart my-app
```

### Blue-Green Deployment

```bash
# Deploy to green environment
deploy-to-green.sh

# Run health checks
curl -f https://green.example.com/health

# Switch traffic
nginx-switch-to-green.sh

# Keep blue as backup for quick rollback
```

## Post-Deployment Checklist

- [ ] Application is running
- [ ] Health check passing
- [ ] SSL certificate valid
- [ ] DNS resolving correctly
- [ ] Monitoring active
- [ ] Error tracking working
- [ ] Logs being collected
- [ ] Backups configured
- [ ] Team notified
- [ ] Documentation updated

## Troubleshooting

### Common Issues

**Build fails:**
```bash
# Clear cache
rm -rf node_modules dist .vite
npm install
npm run build
```

**SSR errors:**
```bash
# Check server logs
pm2 logs my-app --lines 100

# Test SSR locally
npm run preview
```

**Memory leaks:**
```bash
# Monitor memory
pm2 monit

# Generate heap snapshot
node --inspect server/index.js
```

## Summary

**Key Steps:**
1. Configure build for production
2. Set up CI/CD pipeline
3. Choose deployment platform
4. Configure monitoring
5. Test thoroughly
6. Deploy with confidence
7. Monitor and iterate

**Remember:** Always have a rollback plan!
