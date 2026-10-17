import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { apiRouter } from './routes';

export function createServer(): Express {
  const app = express();

  // Permissive CORS to allow extension content scripts on leetcode.com to call local API
  app.use(
    cors({
      origin: '*',
      methods: ['GET', 'POST', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    })
  );

  app.use(express.json());

  // Request logger
  app.use((req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      if (req.path !== '/api/health') {
        console.log(`[HTTP] ${req.method} ${req.originalUrl} ${res.statusCode} (${duration}ms)`);
      }
    });
    next();
  });

  // API router
  app.use('/api', apiRouter);

  // Root welcome / inspection page
  app.get('/', (req: Request, res: Response) => {
    res.send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <title>LeetRoot — Real-World DSA Pattern Finder API</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0b0f19; color: #f3f4f6; margin: 0; padding: 40px; }
          .container { max-width: 860px; margin: 0 auto; background: #111827; padding: 32px; border-radius: 12px; border: 1px solid #1f2937; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }
          h1 { color: #f59e0b; margin-top: 0; font-size: 28px; display: flex; align-items: center; gap: 10px; }
          .badge { background: #374151; font-size: 13px; color: #10b981; padding: 4px 10px; border-radius: 999px; }
          p { color: #9ca3af; line-height: 1.6; }
          .endpoint { background: #1f2937; padding: 12px 16px; border-radius: 8px; margin: 10px 0; font-family: monospace; display: flex; justify-content: space-between; align-items: center; }
          .method { color: #3b82f6; font-weight: bold; }
          a { color: #60a5fa; text-decoration: none; }
          a:hover { text-decoration: underline; }
          .btn { display: inline-block; background: #f59e0b; color: #000; font-weight: 600; padding: 8px 16px; border-radius: 6px; margin-top: 10px; text-decoration: none; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>⚡ LeetRoot API <span class="badge">Phase 1 Live</span></h1>
          <p>Real-World DSA Pattern Finder Engine & Public Dataset API. Bridges the gap between grinding LeetCode and writing production engineering code.</p>
          
          <h3>Available Endpoints</h3>
          <div class="endpoint">
            <span><span class="method">GET</span> /api/examples/by-tag?tags=heap-priority-queue</span>
            <a href="/api/examples/by-tag?tags=heap-priority-queue" target="_blank">Try it &rarr;</a>
          </div>
          <div class="endpoint">
            <span><span class="method">GET</span> /api/examples/by-problem?slug=merge-k-sorted-lists</span>
            <a href="/api/examples/by-problem?slug=merge-k-sorted-lists" target="_blank">Try it &rarr;</a>
          </div>
          <div class="endpoint">
            <span><span class="method">GET</span> /api/tags</span>
            <a href="/api/tags" target="_blank">Try it &rarr;</a>
          </div>
          <div class="endpoint">
            <span><span class="method">GET</span> /api/stats</span>
            <a href="/api/stats" target="_blank">Try it &rarr;</a>
          </div>
          <div class="endpoint">
            <span><span class="method">GET</span> /api/health</span>
            <a href="/api/health" target="_blank">Try it &rarr;</a>
          </div>
        </div>
      </body>
      </html>
    `);
  });

  return app;
}
