import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUI from '@fastify/swagger-ui';
import { db } from './db/db.js';
import { registerApiRoutes } from './routes/api.js';

export async function createServer() {
  const app = Fastify({
    logger: process.env.NODE_ENV !== 'test',
    bodyLimit: 10 * 1024 * 1024 // 10MB limit for inbound raw MIME
  });

  await app.register(helmet, {
    contentSecurityPolicy: false // Allows Swagger UI and local development
  });

  await app.register(cors, {
    origin: [
      process.env.WEB_ORIGIN ?? 'http://localhost:5173',
      'http://localhost:5173',
      'http://127.0.0.1:5173'
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
  });

  await app.register(rateLimit, {
    max: 200,
    timeWindow: '1 minute'
  });

  await app.register(swagger, {
    openapi: {
      info: {
        title: 'Preflight API',
        version: '1.0.0',
        description: 'Evidence-first email deliverability hygiene & DNS remediation copilot.'
      },
      servers: [{ url: `http://localhost:${process.env.API_PORT ?? 4000}` }]
    }
  });

  await app.register(swaggerUI, {
    routePrefix: '/docs'
  });

  // Health route
  app.get('/health', async () => ({
    status: 'ok',
    service: 'preflight-api',
    database: db.isMemory ? 'in-memory-fallback' : 'postgresql',
    timestamp: new Date().toISOString()
  }));

  // Initialize DB & Seed Demo Workspace
  await db.init();

  // Register All v1 API Routes
  await registerApiRoutes(app);

  return app;
}

// Start server if run directly
if (process.argv[1]?.endsWith('server.ts') || process.argv[1]?.endsWith('server.js')) {
  const server = await createServer();
  const port = Number(process.env.API_PORT ?? 4000);
  try {
    await server.listen({ port, host: '0.0.0.0' });
    console.log(`Preflight API listening on http://localhost:${port}`);
    console.log(`OpenAPI documentation available at http://localhost:${port}/docs`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
}
