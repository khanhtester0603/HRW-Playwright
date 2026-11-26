const { test, expect } = require('@playwright/test');
const { accountForRole } = require('../accounts');

const { production: { appOrigin, loginOrigin } } = require('../..');

async function waitForLoginField(page, field) {
  const verification = page.getByRole('heading', {
    name: /Thực hiện xác minh bảo mật|Performing security verification/i,
  });
  await expect(field.or(verification).first()).toBeVisible({ timeout: 15_000 });
  if (await verification.isVisible()) {
    await expect(verification, 'Cloudflare đang yêu cầu xác minh bảo mật trên trang đăng nhập HaraWorks.').toBeHidden({ timeout: 10_000 });
  }
  await expect(field).toBeVisible();
}

async function loginToHaraworks(page, role) {
  const { org, username, password } = accountForRole(role);
  expect(Boolean(org && username && password), `Thiếu cấu hình tài khoản HaraWorks cho role ${role}.`).toBe(true);

  await test.step('Mở HaraWorks và kiểm tra chuyển hướng đến /account/org', async () => {
    await page.goto(appOrigin, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(url => url.origin === loginOrigin && url.pathname === '/account/org');
  });

  await test.step('Nhập mã tổ chức và bấm Tiếp tục', async () => {
    const organization = page.getByRole('textbox').first();
    await waitForLoginField(page, organization);
    await organization.fill(org);
    await page.getByRole('button', { name: 'Tiếp tục', exact: true }).click();
  });

  const loginName = page.getByRole('textbox', { name: 'Tên đăng nhập', exact: true });
  await test.step('Chờ form đăng nhập và kiểm tra URL /account/login', async () => {
    await waitForLoginField(page, loginName);
    // The form can be ready before the page's load event fires.
    await expect.poll(() => {
      const { origin, pathname } = new URL(page.url());
      return origin + pathname;
    }, { message: 'Kiểm tra địa chỉ form đăng nhập HaraWorks' }).toBe(loginOrigin + '/account/login');
  });

  await test.step(`Đăng nhập bằng tài khoản ${role}`, async () => {
    try {
      await loginName.fill(username);
      await page.getByPlaceholder('Nhập mật khẩu', { exact: true }).fill(password);
    } catch {
      throw new Error('Không thể điền thông tin đăng nhập HaraWorks.');
    }
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  });

  await expect(page).toHaveURL(url => url.origin === appOrigin && url.pathname === '/', { timeout: 20_000 });
}

module.exports = { loginToHaraworks };
