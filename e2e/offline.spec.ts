import { expect, test } from '@playwright/test';
import { writeFixture } from './fixtures';

test.use({ locale: 'en-US', serviceWorkers: 'allow' });

test('works offline after the first visit and makes no outside requests', async ({ page, context }) => {
  const outside: string[] = [];
  page.on('request', (request) => {
    if (!request.url().startsWith('http://localhost:4173')) {
      outside.push(request.url());
    }
  });
  await page.goto('/');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await context.setOffline(true);
  await page.reload();
  await page.getByTestId('file-input').setInputFiles(writeFixture());
  await expect(page.getByTestId('layer-row')).toHaveCount(5);
  await page.getByTestId('layer-row').filter({ hasText: 'tone' }).click();
  await page.keyboard.press('ArrowLeft');
  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('save').click();
  expect((await downloadPromise).suggestedFilename()).toBe('figure.psd');
  expect(outside.filter((url) => !url.startsWith('data:') && !url.startsWith('blob:'))).toEqual([]);
});
