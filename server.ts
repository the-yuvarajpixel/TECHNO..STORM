import 'dotenv/config';
import express from 'express';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { WebSocketServer, WebSocket } from 'ws';
import { Modality, type LiveServerMessage } from '@google/genai';
import { createSentinelApiApp } from './src/server/createApiApp.ts';
import {
  buildLiveVoiceSystemInstruction,
  createGeminiClient,
  formatGeminiError,
} from './src/server/gemini.ts';

const PORT = Number(process.env.PORT || 3000);
const IS_PROD = process.env.NODE_ENV === 'production';

const ALLOWED_LIVE_VOICES = new Set(['Puck', 'Charon', 'Kore', 'Fenrir', 'Zephyr']);

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
  const notificationsWss = new WebSocketServer({ noServer: true });
  const liveWss = new WebSocketServer({ noServer: true });
  wssRef = notificationsWss;

  // Route WebSocket upgrade requests cleanly to /ws/notifications or /ws/live
  server.on('upgrade', (request, socket, head) => {
    const pathname = new URL(request.url ?? '/', `http://${request.headers.host || 'localhost'}`).pathname;
    if (pathname === '/ws/notifications') {
      notificationsWss.handleUpgrade(request, socket, head, (ws) => {
        notificationsWss.emit('connection', ws, request);
      });
    } else if (pathname === '/ws/live') {
      liveWss.handleUpgrade(request, socket, head, (ws) => {
        liveWss.emit('connection', ws, request);
      });
    } else {
      socket.destroy();
    }
  });

  // --- 1. Real-Time Sentinel Push Notifications WebSocket ---
  const clientRoles = new Map<WebSocket, 'secops' | 'executive' | 'attacker'>();
  const syncRolePresence = () => {
    const counts = { secops: 0, executive: 0, attacker: 0 };
    for (const role of clientRoles.values()) {
      counts[role] += 1;
    }
    store.setConnectedRoles(counts);
  };

  notificationsWss.on('connection', (socket) => {
    clientRoles.set(socket, 'secops');
    syncRolePresence();

    socket.send(
      JSON.stringify({
        type: 'connection:ready',
        payload: {
          connectedClients: notificationsWss.clients.size,
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

  // --- 2. Gemini 3.8 Live API Real-Time Voice Bridge (/ws/live) ---
  liveWss.on('connection', async (clientWs, req) => {
    const reqUrl = new URL(req.url ?? '/ws/live', `http://${req.headers.host || 'localhost'}`);
    const requestedVoice = reqUrl.searchParams.get('voice') || 'Zephyr';
    const voiceName = ALLOWED_LIVE_VOICES.has(requestedVoice) ? requestedVoice : 'Zephyr';

    const safeSend = (payload: Record<string, unknown>) => {
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify(payload));
      }
    };

    let liveSession: Awaited<ReturnType<ReturnType<typeof createGeminiClient>['live']['connect']>> | null = null;
    let isClosing = false;

    try {
      const ai = createGeminiClient();
      const systemInstruction = buildLiveVoiceSystemInstruction(store.getSnapshot());

      liveSession = await ai.live.connect({
        model: 'gemini-3.8-live',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName,
              },
            },
          },
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          systemInstruction,
        },
        callbacks: {
          onopen: () => {
            safeSend({
              type: 'live:ready',
              model: 'gemini-3.8-live',
              voice: voiceName,
            });
          },
          onmessage: (message: LiveServerMessage) => {
            const parts = message.serverContent?.modelTurn?.parts ?? [];
            for (const part of parts) {
              const audioData = part.inlineData?.data;
              if (audioData) {
                safeSend({ type: 'audio', audio: audioData });
              }
            }
            if (message.serverContent?.interrupted) {
              safeSend({ type: 'interrupted', interrupted: true });
            }
            if (message.serverContent?.turnComplete) {
              safeSend({ type: 'turnComplete' });
            }
            const inputTx = message.serverContent?.inputTranscription?.text;
            if (inputTx) {
              safeSend({ type: 'inputTranscription', text: inputTx });
            }
            const outputTx = message.serverContent?.outputTranscription?.text;
            if (outputTx) {
              safeSend({ type: 'outputTranscription', text: outputTx });
            }
          },
          onerror: (event) => {
            const formatted = formatGeminiError(event?.error ?? event?.message ?? 'Live session error', 'gemini-3.8-live');
            safeSend({ type: 'error', error: formatted.message });
          },
          onclose: () => {
            if (!isClosing) {
              safeSend({ type: 'live:closed' });
            }
          },
        },
      });

      safeSend({
        type: 'live:ready',
        model: 'gemini-3.8-live',
        voice: voiceName,
      });
    } catch (err) {
      const formatted = formatGeminiError(err, 'gemini-3.8-live');
      safeSend({ type: 'error', error: formatted.message });
      clientWs.close();
      return;
    }

    clientWs.on('message', (raw) => {
      if (!liveSession) return;
      try {
        const msg = JSON.parse(String(raw));
        if (typeof msg?.audio === 'string' && msg.audio.length > 0) {
          liveSession.sendRealtimeInput({
            audio: { data: msg.audio, mimeType: 'audio/pcm;rate=16000' },
          });
        } else if (typeof msg?.text === 'string' && msg.text.trim().length > 0) {
          liveSession.sendRealtimeInput({
            text: msg.text.trim(),
          });
        }
      } catch {
        // Ignore malformed frames
      }
    });

    clientWs.on('close', () => {
      isClosing = true;
      try {
        liveSession?.close();
      } catch {
        // Ignore close errors
      }
      liveSession = null;
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
    console.log(`Sentinel console, Live Voice & WebSocket push server listening on http://0.0.0.0:${PORT}`);
  });

  const shutdown = () => {
    notificationsWss.close();
    liveWss.close();
    server.close(() => process.exit(0));
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

startServer().catch((err) => {
  console.error('Failed to start Sentinel server:', err);
  process.exit(1);
});
