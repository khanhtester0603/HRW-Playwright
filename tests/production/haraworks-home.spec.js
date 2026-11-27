const { checklist } = require('../../fixtures/checklist');
const { test, expect } = require('../../fixtures/platform-test');
const { loginToHaraworks } = require('../../environments/production/pages/login-page');

const { production: { appOrigin } } = require('../../environments');
test.use({ trace: 'off', screenshot: 'off', video: 'off' });

test('Admin đăng nhập thành công vào trang chủ HaraWorks', { tag: '@haraworks-home', annotation: checklist(
  "Mở HaraWorks và xác nhận chuyển hướng đến /account/org",
  "Nhập mã tổ chức và bấm Tiếp tục",
  "Chờ form tại /account/login",
  "Đăng nhập bằng tài khoản admin",
  "Truy cập lại trang chủ và xác nhận phiên đăng nhập",
  "Kiểm tra liên kết Chấm công trên trang chủ",
) }, async ({ page }) => {
  test.setTimeout(60_000);
  await loginToHaraworks(page, 'admin');

  await test.step('Truy cập lại trang chủ và xác nhận phiên đăng nhập', async () => {
    await page.goto(appOrigin, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(url => url.origin === appOrigin && url.pathname === '/');
  });

  await test.step('Kiểm tra liên kết Chấm công trên trang chủ', async () => {
    await expect(page.getByRole('link', { name: 'Chấm công', exact: true })).toBeVisible({ timeout: 20_000 });
  });
});
