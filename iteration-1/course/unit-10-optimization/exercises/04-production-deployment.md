# Exercise 4: Production Deployment

**Difficulty:** ⭐⭐⭐⭐⭐ (Advanced)

## Objective

Deploy a production-ready reactive application with full monitoring, error tracking, and performance optimization.

## Requirements

### Part 1: Application Setup
- SSR-enabled application
- Production build configuration
- Environment management
- Security hardening

### Part 2: Monitoring
- Error tracking
- Performance monitoring
- User analytics
- Uptime monitoring

### Part 3: Deployment
- CI/CD pipeline
- Zero-downtime deployment
- Rollback strategy
- Health checks

## Project Structure

```
production-app/
├── src/
│   ├── app/
│   ├── components/
│   └── utils/
├── server/
│   ├── api/
│   └── middleware/
├── .github/
│   └── workflows/
│       └── deploy.yml
├── config/
│   ├── production.js
│   └── staging.js
├── monitoring/
│   ├── error-tracker.js
│   ├── performance.js
│   └── analytics.js
└── scripts/
    ├── build.sh
    └── deploy.sh
```

## Tasks

### Task 1: Production Build Setup

```javascript
// vite.config.production.js
import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';
import compression from 'vite-plugin-compression';
import { visualizer } from 'rollup-plugin-visualizer';

export default defineConfig({
  plugins: [
    solid({ ssr: true }),
    compression({ algorithm: 'brotliCompress' }),
    visualizer({ filename: 'dist/stats.html' })
  ],
  
  build: {
    target: 'es2020',
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
        pure_funcs: ['console.log', 'console.info']
      }
    },
    
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor': ['solid-js'],
          'router': ['@solidjs/router'],
          'utils': ['./src/utils']
        }
      }
    },
    
    sourcemap: true,
    reportCompressedSize: false
  },
  
  define: {
    'process.env.NODE_ENV': '"production"',
    'import.meta.env.API_URL': JSON.stringify(process.env.API_URL)
  }
});
```

### Task 2: Error Tracking

```javascript
// monitoring/error-tracker.js
class ProductionErrorTracker {
  constructor(config) {
    this.endpoint = config.endpoint;
    this.apiKey = config.apiKey;
    this.queue = [];
    this.flushInterval = 30000; // 30 seconds
    
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
        message: event.reason?.message || 'Unhandled Promise Rejection',
        stack: event.reason?.stack,
        type: 'unhandledRejection'
      });
    });
    
    // Periodic flush
    setInterval(() => this.flush(), this.flushInterval);
    
    // Flush before unload
    window.addEventListener('beforeunload', () => this.flush());
  }
  
  captureError(error) {
    const enriched = {
      ...error,
      timestamp: new Date().toISOString(),
      url: window.location.href,
      userAgent: navigator.userAgent,
      userId: this.getUserId(),
      sessionId: this.getSessionId(),
      context: this.getContext()
    };
    
    this.queue.push(enriched);
    
    // Flush immediately for critical errors
    if (error.severity === 'critical') {
      this.flush();
    }
  }
  
  async flush() {
    if (this.queue.length === 0) return;
    
    const errors = [...this.queue];
    this.queue = [];
    
    try {
      await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({ errors })
      });
    } catch (err) {
      console.error('Failed to send errors:', err);
      // Put errors back in queue
      this.queue.unshift(...errors);
    }
  }
  
  getUserId() {
    return localStorage.getItem('userId') || 'anonymous';
  }
  
  getSessionId() {
    let sessionId = sessionStorage.getItem('sessionId');
    if (!sessionId) {
      sessionId = crypto.randomUUID();
      sessionStorage.setItem('sessionId', sessionId);
    }
    return sessionId;
  }
  
  getContext() {
    return {
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight
      },
      performance: {
        memory: performance.memory?.usedJSHeapSize,
        timing: performance.timing?.loadEventEnd - performance.timing?.navigationStart
      }
    };
  }
}

export const errorTracker = new ProductionErrorTracker({
  endpoint: import.meta.env.VITE_ERROR_ENDPOINT,
  apiKey: import.meta.env.VITE_ERROR_API_KEY
});
```

### Task 3: Performance Monitoring

```javascript
// monitoring/performance.js
class PerformanceMonitor {
  constructor() {
    this.metrics = [];
    this.observer = null;
    
    this.init();
  }
  
  init() {
    // Core Web Vitals
    this.trackCLS();
    this.trackFID();
    this.trackLCP();
    
    // Custom metrics
    this.trackPageLoad();
    this.trackInteractions();
    this.trackResourceTiming();
  }
  
  trackCLS() {
    let clsValue = 0;
    let clsEntries = [];
    
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (!entry.hadRecentInput) {
          clsValue += entry.value;
          clsEntries.push(entry);
        }
      }
    });
    
    observer.observe({ type: 'layout-shift', buffered: true });
    
    this.reportMetric('CLS', () => clsValue);
  }
  
  trackFID() {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        this.reportMetric('FID', entry.processingStart - entry.startTime);
      }
    });
    
    observer.observe({ type: 'first-input', buffered: true });
  }
  
  trackLCP() {
    const observer = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const lastEntry = entries[entries.length - 1];
      this.reportMetric('LCP', lastEntry.renderTime || lastEntry.loadTime);
    });
    
    observer.observe({ type: 'largest-contentful-paint', buffered: true });
  }
  
  trackPageLoad() {
    window.addEventListener('load', () => {
      const perfData = performance.getEntriesByType('navigation')[0];
      
      this.reportMetric('TTFB', perfData.responseStart - perfData.requestStart);
      this.reportMetric('DOMContentLoaded', perfData.domContentLoadedEventEnd - perfData.domContentLoadedEventStart);
      this.reportMetric('Load', perfData.loadEventEnd - perfData.loadEventStart);
    });
  }
  
  trackInteractions() {
    // Track long tasks
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.duration > 50) {
          this.reportMetric('LongTask', entry.duration);
        }
      }
    });
    
    observer.observe({ type: 'longtask', buffered: true });
  }
  
  trackResourceTiming() {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        this.reportMetric('ResourceTiming', {
          name: entry.name,
          duration: entry.duration,
          size: entry.transferSize
        });
      }
    });
    
    observer.observe({ type: 'resource', buffered: true });
  }
  
  reportMetric(name, value) {
    const metric = {
      name,
      value: typeof value === 'function' ? value() : value,
      timestamp: Date.now(),
      url: window.location.href
    };
    
    this.metrics.push(metric);
    
    // Send to analytics
    this.sendToAnalytics(metric);
  }
  
  async sendToAnalytics(metric) {
    try {
      await fetch('/api/metrics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(metric)
      });
    } catch (err) {
      console.error('Failed to send metric:', err);
    }
  }
}

export const performanceMonitor = new PerformanceMonitor();
```

### Task 4: CI/CD Pipeline

```yaml
# .github/workflows/deploy.yml
name: Deploy to Production

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

env:
  NODE_VERSION: '18'

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run linter
        run: npm run lint
      
      - name: Run tests
        run: npm test
      
      - name: Build
        run: npm run build
      
      - name: Upload coverage
        uses: codecov/codecov-action@v3

  deploy:
    needs: test
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: ${{ env.NODE_VERSION }}
      
      - name: Install dependencies
        run: npm ci
      
      - name: Build production
        run: npm run build:prod
        env:
          VITE_API_URL: ${{ secrets.API_URL }}
          VITE_ERROR_ENDPOINT: ${{ secrets.ERROR_ENDPOINT }}
          VITE_ERROR_API_KEY: ${{ secrets.ERROR_API_KEY }}
      
      - name: Deploy to server
        uses: easingthemes/ssh-deploy@v2
        env:
          SSH_PRIVATE_KEY: ${{ secrets.SSH_PRIVATE_KEY }}
          REMOTE_HOST: ${{ secrets.REMOTE_HOST }}
          REMOTE_USER: ${{ secrets.REMOTE_USER }}
          TARGET: /var/www/app
      
      - name: Run health check
        run: |
          sleep 10
          curl -f https://your-app.com/health || exit 1
      
      - name: Notify Slack
        if: always()
        uses: 8398a7/action-slack@v3
        with:
          status: ${{ job.status }}
          text: 'Deployment ${{ job.status }}'
          webhook_url: ${{ secrets.SLACK_WEBHOOK }}
```

### Task 5: Health Check Endpoint

```javascript
// server/api/health.js
export async function healthCheck(req, res) {
  const checks = {
    server: 'ok',
    database: await checkDatabase(),
    cache: await checkCache(),
    memory: process.memoryUsage(),
    uptime: process.uptime()
  };
  
  const healthy = Object.values(checks).every(
    check => check === 'ok' || typeof check === 'object'
  );
  
  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'healthy' : 'unhealthy',
    checks,
    timestamp: new Date().toISOString()
  });
}

async function checkDatabase() {
  try {
    await db.query('SELECT 1');
    return 'ok';
  } catch (err) {
    return 'error';
  }
}

async function checkCache() {
  try {
    await cache.ping();
    return 'ok';
  } catch (err) {
    return 'error';
  }
}
```

## Deployment Checklist

- [ ] Environment variables configured
- [ ] SSL certificates installed
- [ ] CDN configured
- [ ] Database migrations run
- [ ] Error tracking enabled
- [ ] Performance monitoring enabled
- [ ] Health check endpoint working
- [ ] Backup strategy in place
- [ ] Rollback plan documented
- [ ] Team notified

## Testing

Test deployment process:

1. Run full build locally
2. Test health check endpoints
3. Verify error tracking
4. Check performance metrics
5. Test rollback procedure

## Submission

Submit:
1. Complete production configuration
2. CI/CD pipeline
3. Monitoring setup
4. Deployment documentation
5. Post-deployment report

## Evaluation Criteria

- ✅ Application deploys successfully
- ✅ Zero-downtime deployment
- ✅ Error tracking works
- ✅ Performance metrics collected
- ✅ Health checks pass
- ✅ Comprehensive documentation
