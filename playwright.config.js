const { defineConfig, devices } = require('@playwright/test');

const platformRun = process.env.HRW_PLATFORM_RUN;

module.exports = defineConfig({
  testDir: './tests',
  ...(platformRun && { outputDir: process.env.HRW_TEST_OUTPUT }),
  reporter: platformRun
    ? [
        ['./platform/reporter.js'],
        ['json'],
      ]
    : [
        ['line'],
        ['html', { open: 'never' }],
        ['json', { outputFile: 'test-results/results.json' }],
      ],
  use: {
    ...devices['Desktop Chrome'],
    ...(process.env.HRW_BROWSER_CHANNEL === 'chrome' && { channel: 'chrome' }),
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
});
