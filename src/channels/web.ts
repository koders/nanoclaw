import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';

import express, {
  type Express,
  type Request,
  type Response,
  type NextFunction,
} from 'express';

import type { Channel, NewMessage } from '../types.js';
import { registerChannel, type ChannelOpts } from './registry.js';

const JID_RE = /^web:[a-z0-9_-]{1,64}$/;

interface SseClient {
  res: Response;
  jid: string;
}

export function createWebChannel(opts: ChannelOpts): Channel | null {
  if (!process.env.WEB_CHANNEL_ENABLED) return null;

  const port = Number(process.env.WEB_CHANNEL_PORT ?? 3100);
  const token = process.env.WEB_CHANNEL_TOKEN;
  if (!token || token.length < 16) {
    throw new Error(
      'WEB_CHANNEL_TOKEN must be >= 16 chars when WEB_CHANNEL_ENABLED=1',
    );
  }

  const sseClients: SseClient[] = [];
  let server: Server | null = null;

  function bearer(req: Request, res: Response, next: NextFunction) {
    const h = req.header('authorization') ?? '';
    const [scheme, value] = h.split(' ');
    if (scheme !== 'Bearer' || value !== token) {
      res.status(401).json({ error: 'unauthenticated' });
      return;
    }
    next();
  }

  function buildApp(): Express {
    const app = express();
    app.use(express.json({ limit: '256kb' }));
    app.use(bearer);

    app.get('/health', (_req, res) => {
      res.json({ ok: true, channel: 'web', connected: true });
    });

    app.post('/messages', (req, res) => {
      const body = req.body as {
        chatJid?: unknown;
        text?: unknown;
        senderName?: unknown;
      };
      if (typeof body.chatJid !== 'string' || !JID_RE.test(body.chatJid)) {
        return res.status(400).json({ error: 'invalid_chatJid' });
      }
      if (
        typeof body.text !== 'string' ||
        !body.text.trim() ||
        body.text.length > 8000
      ) {
        return res.status(400).json({ error: 'invalid_text' });
      }
      const msg: NewMessage = {
        id: randomUUID(),
        chat_jid: body.chatJid,
        sender: 'web-user',
        sender_name:
          typeof body.senderName === 'string' ? body.senderName : 'Web',
        content: body.text,
        timestamp: new Date().toISOString(),
      };
      opts.onMessage(body.chatJid, msg);
      res.json({ ok: true, id: msg.id });
    });

    app.get('/stream', (req, res) => {
      const jid = String(req.query.chatJid ?? '');
      if (!JID_RE.test(jid)) {
        return res.status(400).json({ error: 'invalid_chatJid' });
      }
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders?.();
      const client: SseClient = { res, jid };
      sseClients.push(client);
      const keep = setInterval(() => {
        res.write(`event: ping\ndata: {}\n\n`);
      }, 15_000);
      req.on('close', () => {
        clearInterval(keep);
        const i = sseClients.indexOf(client);
        if (i >= 0) sseClients.splice(i, 1);
      });
    });

    app.get('/history', (_req, res) => {
      // Filled in Task 21
      res.status(501).json({ error: 'not_implemented' });
    });

    return app;
  }

  function broadcast(jid: string, payload: { type: string } & Record<string, unknown>) {
    const data = JSON.stringify(payload);
    for (const c of sseClients) {
      if (c.jid === jid) {
        c.res.write(`event: ${payload.type}\ndata: ${data}\n\n`);
      }
    }
  }

  return {
    name: 'web',
    async connect() {
      const app = buildApp();
      await new Promise<void>((resolve) => {
        server = app.listen(port, '127.0.0.1', () => resolve());
      });
    },
    async sendMessage(jid: string, text: string) {
      broadcast(jid, {
        type: 'message',
        role: 'assistant',
        text,
        ts: new Date().toISOString(),
      });
    },
    async setTyping(jid: string, isTyping: boolean) {
      broadcast(jid, { type: 'typing', isTyping });
    },
    isConnected() {
      return server !== null && server.listening;
    },
    ownsJid(jid: string) {
      return JID_RE.test(jid);
    },
    async disconnect() {
      for (const c of sseClients) {
        try {
          c.res.end();
        } catch {
          /* ignore */
        }
      }
      sseClients.length = 0;
      await new Promise<void>((resolve) => {
        server?.close(() => resolve());
      });
      server = null;
    },
  };
}

registerChannel('web', createWebChannel);
