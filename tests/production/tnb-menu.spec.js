const { checklist } = require('../../fixtures/checklist');
const { test, expect } = require('@playwright/test');
const { loginToHaraworks } = require('../../environments/production/pages/login-page');

const { production: { mailOrigin } } = require('../../environments');
const composePath = '/internal_mail/create';
const menus = [
  ['Tạo thư mới', composePath],
  ['Hộp Thư Đến', '/internal_mail/inbox'],
  ['Có gắn dấu sao', '/internal_mail/starred'],
  ['Đã Gửi', '/internal_mail/sent'],
  ['Nháp', '/internal_mail/draft'],
  ['Lưu trữ', '/internal_mail/storaged'],
  ['Thùng Rác', '/internal_mail/trash'],
  ['Thiết lập tự động', '/internal_mail/mail_filters'],
  ['Gửi thư hàng loạt', '/system/mail_merge'],
  ['Giới hạn người nhận', '/settings/mail'],
  ['Cấu hình', '/internal_mail/config'],
];

test.use({ trace: 'off', screenshot: 'off', video: 'off' });

test.describe('Truy cập menu Thư Nội Bộ bằng admin', { tag: ['@tnb', '@tnb-menu'] }, () => {
  test.describe.configure({ mode: 'default' });
  let page;

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(60_000);
    page = await browser.newPage();
    await loginToHaraworks(page, 'admin');
  });

  test.afterAll(async () => {
    await page?.context().close();
  });

  for (const [name, path] of menus) {
    test(`Truy cập menu ${name}`, {
      annotation: checklist('Đăng nhập HaraWorks bằng admin', 'Mở module Thư Nội Bộ', `Bấm menu ${name} và kiểm tra trang đích`),
    }, async () => {
      await test.step('Mở module Thư Nội Bộ', async () => {
        const startPath = path === composePath ? '/internal_mail/inbox' : composePath;
        await page.goto(mailOrigin + startPath, { waitUntil: 'domcontentloaded', timeout: 15_000 });
      });

      await test.step(`Bấm menu ${name} và kiểm tra trang đích`, async () => {
        const link = page.locator(`a[href="${path}"]`).filter({ visible: true });
        await link.click({ timeout: 10_000 });
        await expect(page).toHaveURL(new RegExp(`^https://ic\\.haraworks\\.vn${path}/?(?:[?#]|$)`), { timeout: 10_000 });
        if (path === composePath) {
          await expect(page.getByRole('textbox', { name: 'Tiêu đề:', exact: true })).toBeVisible();
        } else {
          await expect(page.getByRole('main')).toBeVisible();
        }
      });
    });
  }
});
