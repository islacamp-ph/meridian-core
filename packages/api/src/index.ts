import { serve } from '@hono/node-server';
import { app } from './app.js';
import { MERIDIAN_VERSION } from '@meridian/core';

const port = parseInt(process.env.PORT ?? '3000', 10);

serve({ fetch: app.fetch, port }, () => {
  console.log(JSON.stringify({
    level: 'info',
    message: 'MERIDIAN API started',
    timestamp: new Date().toISOString(),
    context: { port, version: MERIDIAN_VERSION },
  }));
});
