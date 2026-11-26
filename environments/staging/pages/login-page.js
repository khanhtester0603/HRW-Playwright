const { expect } = require('@playwright/test');
const { staging: { appOrigin, loginOrigin } } = require('../..');

async function openOrgForm(page) {
  await page.goto(appOrigin);
  await expect(page).toHaveURL(url => url.origin === loginOrigin && url.pathname === '/account/org');
}

async function selectOrganization(page, org) {
  await openOrgForm(page);
  await page.getByRole('textbox').fill(org);
  await page.getByRole('button', { name: 'Tiếp tục', exact: true }).click();
  await expect(page).toHaveURL(url => url.origin === loginOrigin);
}

async function submitLogin(page, { username, password }) {
  try {
    await page.getByRole('textbox', { name: 'Tên đăng nhập', exact: true }).fill(username);
    await page.getByPlaceholder('Nhập mật khẩu', { exact: true }).fill(password);
  } catch {
    throw new Error('Không thể điền thông tin vào form đăng nhập Zuizui.');
  }
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
}

async function expectWorkplace(page) {
  await expect(page).toHaveURL(url => url.origin === appOrigin && url.pathname === '/', { timeout: 20_000 });
}

module.exports = { openOrgForm, selectOrganization, submitLogin, expectWorkplace };
