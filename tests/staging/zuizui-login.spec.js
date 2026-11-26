const { checklist } = require('../../fixtures/checklist');
const {
  test, expect, accountForRole, openOrgForm, selectOrganization, submitLogin, expectWorkplace,
} = require('../../fixtures/zuizui-test');

async function expectAttendanceLink(page) {
  await expectWorkplace(page);
  await expect(page.getByRole('link', { name: 'Chấm công', exact: true })).toBeVisible({ timeout: 20_000 });
}

test('Không thể tiếp tục khi mã tổ chức trống', { tag: '@zuizui', annotation: checklist(
  "Mở form mã tổ chức",
  "Kiểm tra mã tổ chức trống và nút Tiếp tục bị vô hiệu hóa",
) }, async ({ page }) => {
  await openOrgForm(page);
  await expect(page.getByRole('textbox')).toHaveValue('');
  await expect(page.getByRole('button', { name: 'Tiếp tục', exact: true })).toBeDisabled();
});

test('Form đăng nhập có trường mật khẩu được che và tùy chọn khôi phục', { tag: '@zuizui', annotation: checklist(
  "Chọn tổ chức",
  "Kiểm tra ô đăng nhập và trường mật khẩu được che",
  "Kiểm tra tùy chọn quên mật khẩu và đăng nhập bằng mã QR",
) }, async ({ page }) => {
  const { org } = accountForRole();
  expect(Boolean(org), 'Thiếu cấu hình mã tổ chức Zuizui. Xem README.').toBe(true);
  await selectOrganization(page, org);

  await expect(page.getByRole('textbox', { name: 'Tên đăng nhập', exact: true })).toBeVisible();
  const passwordField = page.getByPlaceholder('Nhập mật khẩu', { exact: true });
  await expect(passwordField).toBeVisible();
  await expect(passwordField).toHaveAttribute('type', 'password');
  await expect(page.getByRole('button', { name: 'Đăng nhập', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Bạn quên mật khẩu?', exact: true })).toHaveAttribute('href', '/account/forgetpassword');
  await expect(page.getByRole('button', { name: 'Đăng nhập bằng mã QR', exact: true })).toBeVisible();
});

test('Đăng nhập Zuizui bằng mã tổ chức', { tag: '@zuizui', annotation: checklist(
  "Mở Zuizui và chọn tổ chức",
  "Gửi form đăng nhập",
  "Xác nhận đã vào màn hình làm việc",
  "Tải lại và kiểm tra phiên đăng nhập còn hiệu lực",
) }, async ({ page }) => {
  const { org, username, password } = accountForRole();
  expect(Boolean(org && username && password), 'Thiếu cấu hình tài khoản Zuizui. Xem README.').toBe(true);

  await test.step('Mở Zuizui và chọn tổ chức', async () => {
    await selectOrganization(page, org);
  });

  await test.step('Gửi form đăng nhập', async () => {
    await submitLogin(page, { username, password });
  });

  await test.step('Xác nhận đã vào màn hình làm việc', async () => {
    await expectAttendanceLink(page);
  });

  await test.step('Tải lại và kiểm tra phiên đăng nhập còn hiệu lực', async () => {
    await page.reload();
    await expectAttendanceLink(page);
  });
});
