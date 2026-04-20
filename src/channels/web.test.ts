import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import request from 'supertest';
import { describe, it, expect, vi } from 'vitest';

import { createWebChannel } from './web.js';

const opts = {
  onMessage: vi.fn(),
  onChatMetadata: vi.fn(),
  registeredGroups: () => ({}),
};

describe('web channel — lifecycle', () => {
  it('returns null when WEB_CHANNEL_ENABLED is unset', () => {
    delete process.env.WEB_CHANNEL_ENABLED;
    expect(createWebChannel(opts)).toBeNull();
  });

  it('connect starts an HTTP server on 127.0.0.1', async () => {
    process.env.WEB_CHANNEL_ENABLED = '1';
    process.env.WEB_CHANNEL_PORT = '0'; // ephemeral
    process.env.WEB_CHANNEL_TOKEN = 't'.repeat(32);
    const ch = createWebChannel(opts);
    expect(ch).not.toBeNull();
    await ch!.connect();
    expect(ch!.isConnected()).toBe(true);
    await ch!.disconnect();
  });

  it('ownsJid matches web:*', () => {
    process.env.WEB_CHANNEL_ENABLED = '1';
    process.env.WEB_CHANNEL_PORT = '0';
    process.env.WEB_CHANNEL_TOKEN = 't'.repeat(32);
    const ch = createWebChannel(opts)!;
    expect(ch.ownsJid('web:default')).toBe(true);
    expect(ch.ownsJid('web:other')).toBe(true);
    expect(ch.ownsJid('telegram:123')).toBe(false);
  });
});

describe('web channel — bearer auth', () => {
  it('rejects /health without a bearer', async () => {
    process.env.WEB_CHANNEL_ENABLED = '1';
    process.env.WEB_CHANNEL_PORT = '0';
    process.env.WEB_CHANNEL_TOKEN = 't'.repeat(32);
    const ch = createWebChannel({
      onMessage: vi.fn(),
      onChatMetadata: vi.fn(),
      registeredGroups: () => ({}),
    })!;
    await ch.connect();
    const srv = (ch as unknown as { _server: Server })._server;
    const port = (srv.address() as AddressInfo).port;

    const noHeader = await request(`http://127.0.0.1:${port}`).get('/health');
    expect(noHeader.status).toBe(401);

    const badHeader = await request(`http://127.0.0.1:${port}`)
      .get('/health')
      .set('authorization', 'Bearer wrong');
    expect(badHeader.status).toBe(401);

    const good = await request(`http://127.0.0.1:${port}`)
      .get('/health')
      .set('authorization', `Bearer ${'t'.repeat(32)}`);
    expect(good.status).toBe(200);

    await ch.disconnect();
  });
});
