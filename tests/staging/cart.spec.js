const { checklist } = require('../../fixtures/checklist');
const { test, expect } = require('@playwright/test');
const { resolve } = require('node:path');
const { pathToFileURL } = require('node:url');

const demoUrl = pathToFileURL(resolve(__dirname, '../../fixtures/cart.html'));
if (process.env.DEMO_REGRESSION === '1') {
  demoUrl.searchParams.set('regression', 'price');
}

test.beforeEach(async ({ page }) => {
  await page.goto(demoUrl.href);
});

test('Giỏ hàng ban đầu trống', { tag: ['@smoke', '@regression'], annotation: checklist(
  "Mở giỏ hàng mẫu",
  "Kiểm tra giỏ trống, số lượng 0 và tổng tiền 0",
) }, async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'Giỏ hàng mẫu' })).toBeVisible();
  await expect(page.getByLabel('Số lượng')).toHaveText('0');
});

test('Thêm hai sản phẩm cập nhật tổng tiền', { tag: ['@smoke', '@regression'], annotation: checklist(
  "Mở giỏ hàng mẫu",
  "Thêm hai cuốn sổ",
  "Kiểm tra số lượng và tổng tiền",
) }, async ({ page }) => {
  await test.step('Thêm hai cuốn sổ', async () => {
    await page.getByRole('button', { name: 'Thêm sổ tay' }).click();
    await page.getByRole('button', { name: 'Thêm sổ tay' }).click();
  });
  await test.step('Kiểm tra số lượng và tổng tiền', async () => {
    await expect(page.getByLabel('Số lượng')).toHaveText('2');
    await expect(page.getByLabel('Tổng tiền')).toHaveText('100.000 ₫');
  });
});

test('Xóa sản phẩm đưa tổng tiền về 0', { tag: '@regression', annotation: checklist(
  "Mở giỏ hàng mẫu",
  "Thêm sản phẩm và xóa giỏ hàng",
  "Kiểm tra giỏ trống và tổng tiền về 0",
) }, async ({ page }) => {
  await page.getByRole('button', { name: 'Thêm sổ tay' }).click();
  await expect(page.getByLabel('Tổng tiền')).toHaveText('50.000 ₫');
  await page.getByRole('button', { name: 'Xóa giỏ hàng' }).click();
  await expect(page.getByLabel('Số lượng')).toHaveText('0');
  await expect(page.getByLabel('Tổng tiền')).toHaveText('0 ₫');
});
