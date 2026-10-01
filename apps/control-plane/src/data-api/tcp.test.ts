import { type Server, createServer } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { waitForPort } from './tcp.js';

const servers: Server[] = [];

function listen(port = 0): Promise<{ server: Server; port: number }> {
  return new Promise((resolve) => {
    const server = createServer((socket) => socket.end());
    servers.push(server);
    server.listen(port, '127.0.0.1', () => {
      const address = server.address();
      resolve({
        server,
        port: typeof address === 'object' && address ? address.port : 0,
      });
    });
  });
}

afterEach(() => {
  for (const server of servers.splice(0)) server.close();
});

describe('waitForPort', () => {
  it('resolves true once something listens', async () => {
    const { port } = await listen();
    expect(await waitForPort('127.0.0.1', port, 1_000)).toBe(true);
  });

  it('resolves false when nothing listens before the deadline', async () => {
    const { server, port } = await listen();
    await new Promise((resolve) => server.close(resolve));
    const started = Date.now();
    expect(await waitForPort('127.0.0.1', port, 400)).toBe(false);
    expect(Date.now() - started).toBeGreaterThanOrEqual(300);
  });

  it('keeps trying and catches a server that starts late', async () => {
    const { server, port } = await listen();
    await new Promise((resolve) => server.close(resolve));
    const waiting = waitForPort('127.0.0.1', port, 3_000);
    setTimeout(() => void listen(port), 500);
    expect(await waiting).toBe(true);
  });
});
