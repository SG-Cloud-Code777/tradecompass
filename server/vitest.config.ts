import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? 'postgres://postgres@localhost:5432/tradecompass_test',
      MARKET_DATA_PROVIDERS: 'yahoo',
      ALPHAVANTAGE_API_KEY: '',
      TWELVEDATA_API_KEY: '',
      FMP_API_KEY: '',
      VAPID_PUBLIC_KEY: '',
      VAPID_PRIVATE_KEY: '',
    },
    fileParallelism: false,
    testTimeout: 30_000,
  },
});
