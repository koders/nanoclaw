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
