const { chromium } = require('playwright');
const { mkdtemp, readFile, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { setTimeout: delay } = require('node:timers/promises');

async function main() {
  const profile = await mkdtemp(join(tmpdir(), 'hrw-inspect-'));
  let context;
  try {
    context = await chromium.launchPersistentContext(profile, {
      headless: false,
      channel: process.env.HRW_BROWSER_CHANNEL === 'chrome' ? 'chrome' : undefined,
      args: ['--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0'],
    });
    const [port] = (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n');
    const closed = new Promise(resolve => context.once('close', resolve));
    const watchPage = page => page.once('close', () => {
      if (!context.pages().length) void context.close().catch(() => {});
    });
    const [blank] = context.pages();
    context.pages().forEach(watchPage);
    context.on('page', page => {
      watchPage(page);
      if (blank && !blank.isClosed() && blank.url() === 'about:blank') void blank.close().catch(() => {});
    });
    await new Promise((resolve, reject) => {
      if (!process.connected) return reject(new Error('Runner đã ngắt kết nối.'));
      process.send({ port }, error => error ? reject(error) : resolve());
    });
    if (process.connected) process.disconnect();
    await closed;
  } catch (error) {
    if (process.connected) {
      await new Promise(resolve => process.send({ error: error.message }, resolve));
      if (process.connected) process.disconnect();
    }
    await context?.close().catch(() => {});
  } finally {
    await delay(100);
    await rm(profile, { recursive: true, force: true, maxRetries: 3 }).catch(() => {});
  }
}

void main();
