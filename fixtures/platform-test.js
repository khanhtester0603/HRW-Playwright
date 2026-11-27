const { test: base, expect, chromium } = require('@playwright/test');
const { fork } = require('node:child_process');

async function inspectionSession() {
  const helper = fork(require.resolve('../platform/inspection-browser'), [], {
    detached: true,
    stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
  });
  const port = await new Promise((resolve, reject) => {
    helper.once('message', result => {
      if (result.error) reject(new Error(result.error));
      else resolve(result.port);
    });
    helper.once('error', reject);
    helper.once('exit', () => reject(new Error('Trình duyệt kiểm chứng đã đóng trước khi kết nối.')));
  }).finally(() => helper.unref());
  const connection = await chromium.connectOverCDP('http://127.0.0.1:' + port);
  return { context: connection.contexts()[0], release: () => connection.close() };
}

async function openTestSession(browser) {
  const session = process.env.HRW_KEEP_BROWSER === '1' && await inspectionSession();
  const context = session ? session.context : await browser.newContext();
  return { newPage: () => context.newPage(), release: session ? session.release : () => context.close() };
}

const test = process.env.HRW_KEEP_BROWSER === '1' ? base.extend({
  context: async ({}, use) => {
    const session = await inspectionSession();
    try {
      await use(session.context);
    } finally {
      await session.release();
    }
  },
}) : base;

module.exports = { test, expect, openTestSession };
