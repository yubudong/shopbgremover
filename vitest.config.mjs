import { readFile } from 'node:fs/promises';
import { cloudflareTest } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';

const schema = (await readFile('./worker/schema.sql', 'utf8'))
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('--'))
  .join('\n');

export default defineConfig({
  plugins: [
    cloudflareTest(async () => ({
      wrangler: {
        configPath: './wrangler.toml',
      },
      miniflare: {
        bindings: {
          TEST_SCHEMA: schema,
          GOOGLE_CLIENT_ID: 'test-google-client',
          GOOGLE_CLIENT_SECRET: 'test-google-secret',
          JWT_SECRET: 'test-jwt-secret-with-enough-entropy',
          FAL_API_KEY: 'test-fal-key',
          PAYPAL_CLIENT_ID: 'test-paypal-client',
          PAYPAL_SECRET: 'test-paypal-secret',
          PAYPAL_MODE: 'sandbox',
          RESEND_API_KEY: 'test-resend-key',
          RESEND_FROM: 'test@example.com',
        },
      },
    })),
  ],
  test: {
    include: ['tests/worker.integration.test.js'],
    testTimeout: 10_000,
  },
});
