import 'dotenv/config';
import express from 'express';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { WebSocketServer, WebSocket } from 'ws';
import { createSentinelApiApp } from './src/server/createApiApp.ts';

const PORT = Number(process.env.PORT || 3000);
const IS_PROD = process.env.NODE_ENV === 'production';

async function startServer() {
  let wssRef: WebSocketServer | null = null;

  const broadcast = (eventType: string, payload: unknown) => {
    if (!wssRef) return;
    const message = JSON.stringify({
      type: eventType,
      payload,
      sentAt: new Date().toISOString(),
    });
    for (const client of wssRef.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  };

  const { app, store } = createSentinelApiApp({
    broadcast,
    getWsClientCount: () => wssRef?.clients.size ?? 0,
  });

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws/notifications' });
  wssRef = wss;

  const clientRoles = new Map<WebSocket, 'secops' | 'executive' | 'attacker'>();
  const syncRolePresence = () => {
    const counts = { secops: 0, executive: 0, attacker: 0 };
    for (const role of clientRoles.values()) {
      counts[role] += 1;
    }
    store.setConnectedRoles(counts);
  };

  wss.on('connection', (socket) => {
    clientRoles.set(socket, 'secops');
    syncRolePresence();

    socket.send(
      JSON.stringify({
        type: 'connection:ready',
        payload: {
          connectedClients: wss.clients.size,
          region: store.getSnapshot().controlPlane.region,
        },
        sentAt: new Date().toISOString(),
      }),
    );

    socket.on('message', (raw) => {
      try {
        const msg = JSON.parse(String(raw));
        if (msg?.type === 'ping') {
          socket.send(JSON.stringify({ type: 'pong', sentAt: new Date().toISOString() }));
        } else if (
          msg?.type === 'client:role' &&
          (msg.role === 'admin' ||
            msg.role === 'secops' ||
            msg.role === 'executive' ||
            msg.role === 'attacker')
        ) {
          clientRoles.set(socket, msg.role === 'admin' ? 'secops' : msg.role);
          syncRolePresence();
        }
      } catch {
        // Ignore malformed client frames
      }
    });

    socket.on('close', () => {
      clientRoles.delete(socket);
      syncRolePresence();
    });
  });

  // --- Frontend Serving (Vite Dev Middleware or Built Static Dist) ---
  if (!IS_PROD) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    const publicAssets = path.resolve(process.cwd(), 'public/assets');
    if (fs.existsSync(publicAssets)) {
      app.use('/assets', express.static(publicAssets));
    }
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Sentinel console & WebSocket push server listening on http://0.0.0.0:${PORT}`);
  });

  const shutdown = () => {
    wss.close();
    server.close(() => process.exit(0));
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

startServer().catch((err) => {
  console.error('Failed to start Sentinel server:', err);
  process.exit(1);
});
