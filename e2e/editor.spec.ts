import { expect, test, type Page } from '@playwright/test';
import { unzipSync } from 'fflate';
import { canvasPoint, layerNamed, openFixture, parseSaved, readDownload } from './fixtures';

test.use({ locale: 'en-US' });

async function save(page: Page) {
  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('save').click();
  return parseSaved(await readDownload(await downloadPromise));
}

async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 6 });
  await page.mouse.up();
}

test('opens a PSD and lists its layers top first', async ({ page }) => {
  await openFixture(page);
  await expect(page.getByTestId('layer-row')).toHaveText(['tone', 'figure', 'face', 'torso', 'paper']);
  await expect(page.getByTestId('status')).toHaveText('');
});

test('drags a layer on the canvas, undoes, redoes and saves the new position', async ({ page }) => {
  await openFixture(page);
  const from = await canvasPoint(page, 100, 50);
  await drag(page, from, { x: from.x + 30, y: from.y + 10 });
  await expect(page.locator('.layer-row.selected')).toHaveText('face');
  await page.getByTestId('undo').click();
  expect(layerNamed(await save(page), 'face')).toMatchObject({ left: 70, top: 20 });
  await page.getByTestId('redo').click();
  expect(layerNamed(await save(page), 'face')).toMatchObject({ left: 100, top: 30, right: 160, bottom: 90 });
});

test('nudges with the keyboard and edits properties', async ({ page }) => {
  await openFixture(page);
  await page.getByTestId('layer-row').filter({ hasText: 'torso' }).click();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Shift+ArrowDown');
  await page.getByLabel('Name').fill('body');
  await page.getByLabel('Name').press('Enter');
  await page.getByLabel('Blend mode').selectOption('screen');
  await page.getByTestId('layer-row').filter({ hasText: 'body' }).getByTestId('visibility').click();
  const torso = layerNamed(await save(page), 'body');
  expect(torso).toMatchObject({ left: 61, top: 90, blendMode: 'screen', hidden: true });
});

test('keeps shortcuts working after the opacity slider is used', async ({ page }) => {
  await openFixture(page);
  await page.getByTestId('layer-row').filter({ hasText: 'torso' }).click();
  const slider = page.locator('input[type="range"]');
  const box = await slider.boundingBox();
  if (!box) {
    throw new Error('opacity slider is not visible');
  }
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(slider).toBeFocused();
  const opacity = await slider.inputValue();
  await page.keyboard.press('ArrowRight');
  await expect(slider).toHaveValue(opacity);
  const torso = layerNamed(await save(page), 'torso');
  expect(torso).toMatchObject({ left: 61 });
});

test('keeps the layer list in place when a layer is selected', async ({ page }) => {
  await openFixture(page);
  const row = page.locator('[data-testid="layer-row"][data-name="face"]');
  const before = await row.boundingBox();
  await row.locator('.layer-name').dblclick();
  expect((await row.boundingBox())?.y).toBe(before?.y);
  await expect(row.locator('input.rename')).toBeFocused();
});

test('reorders layers by dragging rows', async ({ page }) => {
  await openFixture(page);
  await page.getByTestId('layer-row').filter({ hasText: 'paper' }).dragTo(page.getByTestId('layer-row').filter({ hasText: 'tone' }), { targetPosition: { x: 40, y: 2 } });
  await expect(page.getByTestId('layer-row')).toHaveText(['paper', 'tone', 'figure', 'face', 'torso']);
  const psd = await save(page);
  expect(psd.children!.map((layer) => layer.name)).toEqual(['figure', 'tone', 'paper']);
});

test('groups, ungroups, duplicates and deletes', async ({ page }) => {
  await openFixture(page);
  await page.getByTestId('layer-row').filter({ hasText: 'tone' }).click();
  await page.keyboard.press('Control+j');
  await expect(page.getByTestId('layer-row')).toHaveText(['tone copy', 'tone', 'figure', 'face', 'torso', 'paper']);
  await page.keyboard.press('Delete');
  await page.getByTestId('layer-row').filter({ hasText: 'paper' }).click();
  await page.keyboard.press('Control+g');
  await expect(page.getByTestId('layer-row')).toHaveText(['tone', 'figure', 'face', 'torso', 'Group', 'paper']);
  await page.getByTestId('layer-row').filter({ hasText: 'figure' }).click();
  await page.keyboard.press('Control+Shift+g');
  await expect(page.getByTestId('layer-row')).toHaveText(['tone', 'face', 'torso', 'Group', 'paper']);
});

test('free transform scales a layer and saves the resampled pixels', async ({ page }) => {
  await openFixture(page);
  await page.getByTestId('layer-row').filter({ hasText: 'face' }).click();
  await page.getByTestId('transform').click();
  const corner = await canvasPoint(page, 130, 80);
  await drag(page, corner, { x: corner.x + 60, y: corner.y + 60 });
  await page.getByTestId('apply-transform').click();
  const face = layerNamed(await save(page), 'face');
  expect(face.left).toBe(70);
  expect(face.top).toBe(20);
  expect((face.right ?? 0) - (face.left ?? 0)).toBeGreaterThan(100);
});

test('runs the rig check and selects the layer of a finding', async ({ page }) => {
  await openFixture(page);
  await page.getByTestId('tab-check').click();
  await expect(page.locator('[data-rule="blend-mode"]')).toHaveCount(1);
  await page.locator('[data-rule="blend-mode"]').click();
  await expect(page.getByLabel('Name')).toHaveValue('tone');
  await page.getByRole('button', { name: 'Compare with the preview stored in the file' }).click();
  await expect(page.getByText(/% of pixels match/)).toBeVisible();
});

test('exports layers as a zip with a manifest', async ({ page }) => {
  await openFixture(page);
  await page.getByTestId('export').click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Export layers with folders (ZIP)' }).click();
  const files = unzipSync(new Uint8Array(await readDownload(await downloadPromise)));
  expect(Object.keys(files).sort()).toEqual(['figure/face.png', 'figure/torso.png', 'layers.json', 'paper.png', 'tone.png']);
  const manifest = JSON.parse(new TextDecoder().decode(files['layers.json']));
  expect(manifest.layers.find((layer: { name: string }) => layer.name === 'face')).toMatchObject({ left: 70, top: 20, width: 60, height: 60 });
});

test('opens the built-in sample and switches language', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('sample').click();
  await expect(page.getByTestId('layer-row')).toHaveCount(7);
  await page.getByTestId('language').click();
  await expect(page.getByTestId('tab-layers')).toHaveText('圖層');
});

test('rejects files that are not PSD', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles({ name: 'note.psd', mimeType: 'application/octet-stream', buffer: Buffer.from('hello') });
  await expect(page.getByTestId('status')).toHaveText('This does not look like a PSD file.');
});
