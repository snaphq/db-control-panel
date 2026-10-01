import { connect } from 'node:net';

const ATTEMPT_TIMEOUT_MS = 1_000;
const RETRY_DELAY_MS = 300;

function tryConnect(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ host, port, timeout: ATTEMPT_TIMEOUT_MS });
    const done = (ok: boolean) => {
      socket.destroy();
      resolve(ok);
    };
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
  });
}

/**
 * Waits until something accepts TCP connections on `host:port`, up to
 * `timeoutMs`. The PostgREST container starts a few seconds after the compute
 * reports running, and a refused connection is cheap to retry before any request
 * body has been consumed.
 */
export async function waitForPort(
  host: string,
  port: number,
  timeoutMs: number,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (await tryConnect(host, port)) return true;
    if (Date.now() >= deadline) return false;
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
  }
}
