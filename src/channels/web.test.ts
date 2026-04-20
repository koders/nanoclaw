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

describe('web channel — POST /messages', () => {
  async function make() {
    process.env.WEB_CHANNEL_ENABLED = '1';
    process.env.WEB_CHANNEL_PORT = '0';
    process.env.WEB_CHANNEL_TOKEN = 't'.repeat(32);
    const onMessage = vi.fn();
    const ch = createWebChannel({
      onMessage,
      onChatMetadata: vi.fn(),
      registeredGroups: () => ({}),
    })!;
    await ch.connect();
    const srv = (ch as unknown as { _server: Server })._server;
    const port = (srv.address() as AddressInfo).port;
    return { ch, port, onMessage };
  }

  it('calls opts.onMessage on valid body', async () => {
    const { ch, port, onMessage } = await make();
    const res = await request(`http://127.0.0.1:${port}`)
      .post('/messages')
      .set('authorization', `Bearer ${'t'.repeat(32)}`)
      .send({ chatJid: 'web:default', text: 'hello' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(onMessage).toHaveBeenCalledOnce();
    const [jid, msg] = onMessage.mock.calls[0]!;
    expect(jid).toBe('web:default');
    expect(msg.content).toBe('hello');
    expect(msg.chat_jid).toBe('web:default');
    await ch.disconnect();
  });

  it('rejects invalid chatJid with 400', async () => {
    const { ch, port } = await make();
    const res = await request(`http://127.0.0.1:${port}`)
      .post('/messages')
      .set('authorization', `Bearer ${'t'.repeat(32)}`)
      .send({ chatJid: 'tele:1', text: 'x' });
    expect(res.status).toBe(400);
    await ch.disconnect();
  });

  it('rejects empty text with 400', async () => {
    const { ch, port } = await make();
    const res = await request(`http://127.0.0.1:${port}`)
      .post('/messages')
      .set('authorization', `Bearer ${'t'.repeat(32)}`)
      .send({ chatJid: 'web:default', text: '' });
    expect(res.status).toBe(400);
    await ch.disconnect();
  });
});
