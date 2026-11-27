const { checklist } = require('../../fixtures/checklist');
const { randomUUID } = require('node:crypto');
const { test, expect, openTestSession } = require('../../fixtures/platform-test');
const { loginToHaraworks } = require('../../environments/production/pages/login-page');
const { accountForRole } = require('../../environments/production/accounts');

const { InternalMailPage } = require('../../environments/production/pages/internal-mail-page');

const receiverRole = 'store_manager';

test.use({ trace: 'off', screenshot: 'off', video: 'off' });

test('TNB · Admin gửi thư nội bộ và AUTO000340 nhận được', { tag: '@tnb', annotation: checklist(
  "Mở HaraWorks và xác nhận chuyển hướng đến /account/org",
  "Nhập mã tổ chức và bấm Tiếp tục",
  "Chờ form tại /account/login",
  "Đăng nhập bằng tài khoản admin",
  "Mở trực tiếp form soạn thư",
  "Chọn đúng người nhận AUTO000340",
  "Nhập tiêu đề và nội dung rồi gửi thư",
  "Kiểm tra thư có trong mục Đã Gửi của admin",
  "Đăng nhập bằng tài khoản người nhận trong phiên riêng",
  "Mở hộp thư đến và đối chiếu nội dung",
) }, async ({ page, browser }) => {
  test.setTimeout(150_000);
  const receiver = accountForRole(receiverRole);
  expect(receiver.username?.toUpperCase(), 'Role người nhận phải trỏ đến AUTO000340.').toBe('AUTO000340');
  expect(Boolean(receiver.org && receiver.password), 'Thiếu cấu hình đăng nhập của người nhận.').toBe(true);

  const subject = `[TNB] Kiểm thử thư nội bộ ${randomUUID()}`;
  const message = `Thư kiểm thử tự động. Mã đối chiếu: ${subject}`;

  await loginToHaraworks(page, 'admin');
  const senderMail = new InternalMailPage(page);

  await test.step('Mở trực tiếp form soạn thư', async () => {
    await senderMail.openCompose();
  });

  await test.step('Chọn đúng người nhận AUTO000340', async () => {
    await senderMail.selectReceiver(receiver.username);
  });

  await test.step('Nhập tiêu đề và nội dung rồi gửi thư', async () => {
    await senderMail.send(subject, message);
  });

  await test.step('Kiểm tra thư có trong mục Đã Gửi của admin', async () => {
    await senderMail.expectSent(subject);
  });

  const receiverSession = await openTestSession(browser);
  try {
    const receiverPage = await receiverSession.newPage();
    await loginToHaraworks(receiverPage, receiverRole);

    await test.step('Mở hộp thư đến của AUTO000340 và đối chiếu nội dung', async () => {
      await new InternalMailPage(receiverPage).expectReceived(subject, message);
    });
  } finally {
    await receiverSession.release();
  }
});
