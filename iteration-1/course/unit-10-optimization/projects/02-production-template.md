# Project 2: Production Deployment Template

## Overview

Create a production-ready deployment template for Solid.js reactive applications with SSR, monitoring, CI/CD, and zero-downtime deployment.

## Objectives

- Set up SSR with hydration
- Configure production build
- Implement monitoring and error tracking
- Create CI/CD pipeline
- Deploy with zero downtime

## Features

### Core Features

1. **SSR Setup**
   - Server-side rendering
   - Client hydration
   - State serialization
   - SEO optimization

2. **Build Configuration**
   - Production optimization
   - Code splitting
   - Asset optimization
   - Source maps

3. **Monitoring**
   - Error tracking
   - Performance monitoring
   - User analytics
   - Health checks

4. **Deployment**
   - CI/CD pipeline
   - Zero-downtime deployment
   - Rollback capability
   - Environment management

## Implementation Guide

### Step 1: Project Setup

```bash
npm create vite@latest production-template -- --template solid-ts
cd production-template
npm install

# Server dependencies
npm install express compression helmet
npm install --save-dev @types/express @types/compression
```

### Step 2: Configure SSR

```typescript
// src/entry-server.tsx
import { renderToString } from 'solid-js/web';
import { App } from './App';

export function render(url: string) {
  const html = renderToString(() => <App url={url} />);
  return html;
}
```

```typescript
// src/entry-client.tsx
import { hydrate } from 'solid-js/web';
import { App } from './App';

hydrate(() => <App />, document.getElementById('app')!);
```

```typescript
// server/index.ts
import express from 'express';
import compression from 'compression';
import helmet from 'helmet';
import { render } from '../dist/server/entry-server.js';

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"]
    }
  }
}));

// Compression
app.use(compression());

// Static assets
app.use('/assets', express.static('dist/client/assets', {
  maxAge: '1y',
  immutable: true
}));

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage()
  });
});

// SSR
app.get('*', async (req, res) => {
  try {
    const html = render(req.url);
    
    res.send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Production App</title>
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

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
```

### Step 3: Production Build Config

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';
import compression from 'vite-plugin-compression';

export default defineConfig({
  plugins: [
    solid({ ssr: true }),
    compression({ algorithm: 'brotliCompress' })
  ],
  
  build: {
    target: 'es2020',
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true
      }
    },
    
    rollupOptions: {
      input: {
        client: './src/entry-client.tsx',
        server: './src/entry-server.tsx'
      },
      output: {
        manualChunks: {
          vendor: ['solid-js']
        }
      }
    },
    
    sourcemap: true
  }
});
```

### Step 4: Error Tracking

```typescript
// src/utils/error-tracker.ts
class ErrorTracker {
  private endpoint: string;
  private queue: any[] = [];
  
  constructor(endpoint: string) {
    this.endpoint = endpoint;
    this.init();
  }
  
  init() {
    // Global error handler
    window.addEventListener('error', (event) => {
      this.captureError({
        message: event.error?.message || event.message,
        stack: event.error?.stack,
        filename: event.filename,
        line: event.lineno,
        column: event.colno
      });
    });
    
    // Unhandled rejections
    window.addEventListener('unhandledrejection', (event) => {
      this.captureError({
        message: 'Unhandled Promise Rejection',
        reason: event.reason
      });
    });
    
    // Periodic flush
    setInterval(() => this.flush(), 30000);
  }
  
  captureError(error: any) {
    const enriched = {
      ...error,
      timestamp: new Date().toISOString(),
      url: window.location.href,
      userAgent: navigator.userAgent
    };
    
    this.queue.push(enriched);
  }
  
  async flush() {
    if (this.queue.length === 0) return;
    
    const errors = [...this.queue];
    this.queue = [];
    
    try {
      await fetch(this.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ errors })
      });
    } catch (err) {
      console.error('Failed to send errors:', err);
      this.queue.unshift(...errors);
    }
  }
}

export const errorTracker = new ErrorTracker(
  import.meta.env.VITE_ERROR_ENDPOINT
);
```

### Step 5: Performance Monitoring

```typescript
// src/utils/performance.ts
class PerformanceMonitor {
  constructor() {
    this.init();
  }
  
  init() {
    // Track Core Web Vitals
    this.trackCLS();
    this.trackFID();
    this.trackLCP();
    
    // Track page load
    this.trackPageLoad();
  }
  
  trackCLS() {
    let clsValue = 0;
    
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (!(entry as any).hadRecentInput) {
          clsValue += (entry as any).value;
        }
      }
    });
    
    observer.observe({ type: 'layout-shift', buffered: true });
    
    this.reportMetric('CLS', () => clsValue);
  }
  
  trackFID() {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        this.reportMetric('FID', (entry as any).processingStart - entry.startTime);
      }
    });
    
    observer.observe({ type: 'first-input', buffered: true });
  }
  
  trackLCP() {
    const observer = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const lastEntry = entries[entries.length - 1] as any;
      this.reportMetric('LCP', lastEntry.renderTime || lastEntry.loadTime);
    });
    
    observer.observe({ type: 'largest-contentful-paint', buffered: true });
  }
  
  trackPageLoad() {
    window.addEventListener('load', () => {
      const perfData = performance.getEntriesByType('navigation')[0] as any;
      
      this.reportMetric('TTFB', perfData.responseStart - perfData.requestStart);
      this.reportMetric('DOMContentLoaded', perfData.domContentLoadedEventEnd - perfData.domContentLoadedEventStart);
      this.reportMetric('Load', perfData.loadEventEnd - perfData.loadEventStart);
    });
  }
  
  reportMetric(name: string, value: number | (() => number)) {
    const metric = {
      name,
      value: typeof value === 'function' ? value() : value,
      timestamp: Date.now()
    };
    
    // Send to analytics
    fetch('/api/metrics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(metric)
    });
  }
}

export const performanceMonitor = new PerformanceMonitor();
```

### Step 6: CI/CD Pipeline

```yaml
# .github/workflows/deploy.yml
name: Deploy

on:
  push:
    branches: [main]

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
      
      - name: Test
        run: npm test
  
  build:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node
        uses: actions/setup-node@v3
        with:
          node-version: ${{ env.NODE_VERSION }}
      
      - name: Install
        run: npm ci
      
      - name: Build
        run: npm run build
        env:
          VITE_API_URL: ${{ secrets.API_URL }}
      
      - name: Upload Artifacts
        uses: actions/upload-artifact@v3
        with:
          name: dist
          path: dist/
  
  deploy:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/download-artifact@v3
        with:
          name: dist
      
      - name: Deploy
        run: |
          # Your deployment script
          echo "Deploying to production..."
      
      - name: Health Check
        run: |
          sleep 10
          curl -f https://your-app.com/health || exit 1
```

### Step 7: Docker Configuration

```dockerfile
# Dockerfile
FROM node:18-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:18-alpine

WORKDIR /app

COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
COPY --from=build /app/package*.json ./

RUN npm ci --production

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node healthcheck.js

CMD ["node", "server/index.js"]
```

```yaml
# docker-compose.yml
version: '3.8'

services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - PORT=3000
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
```

## Deliverables

1. **Working Application**
   - [ ] SSR functioning
   - [ ] Production build optimized
   - [ ] Monitoring active
   - [ ] CI/CD pipeline working

2. **Documentation**
   - [ ] Setup guide
   - [ ] Deployment guide
   - [ ] Configuration reference
   - [ ] Troubleshooting guide

3. **Scripts**
   - [ ] Build scripts
   - [ ] Deployment scripts
   - [ ] Health check scripts
   - [ ] Rollback scripts

4. **Tests**
   - [ ] Unit tests
   - [ ] Integration tests
   - [ ] E2E tests
   - [ ] Performance tests

## Deployment Checklist

- [ ] Environment variables configured
- [ ] SSL certificates installed
- [ ] CDN configured
- [ ] Database migrations run
- [ ] Error tracking enabled
- [ ] Performance monitoring enabled
- [ ] Health checks working
- [ ] Backup strategy in place
- [ ] Rollback plan documented
- [ ] Team notified

## Resources

- [Vite SSR Guide](https://vitejs.dev/guide/ssr.html)
- [Express Documentation](https://expressjs.com/)
- [Docker Documentation](https://docs.docker.com/)
- [GitHub Actions](https://docs.github.com/en/actions)

## Evaluation

- ✅ Application deploys successfully
- ✅ Zero-downtime deployment works
- ✅ Monitoring captures data
- ✅ Error tracking functional
- ✅ Performance metrics collected
- ✅ Documentation complete
