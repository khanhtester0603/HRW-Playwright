const { expect } = require('@playwright/test');
const { production: { mailOrigin } } = require('../..');

const composePath = '/internal_mail/create';
const inboxPath = '/internal_mail/inbox';
const sentPath = '/internal_mail/sent';

class InternalMailPage {
  constructor(page) {
    this.page = page;
  }

  async openCompose() {
    const { page } = this;
    await page.goto(mailOrigin + composePath, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(mailOrigin + composePath, { timeout: 20_000 });
  }

  async selectReceiver(username) {
    const { page } = this;
    const composeForm = page.getByRole('main');
    const recipientFields = composeForm.getByRole('textbox', {
      name: 'Nhập mã, tên nhân viên để tìm kiếm', exact: true,
    });
    // The compose form lists Đến before CC, with identical input names.
    await expect(recipientFields).toHaveCount(2, { timeout: 10_000 });
    await recipientFields.first().fill(username, { timeout: 10_000 });
    const employeeCode = /\bAUTO000340\b/i;
    const option = page.getByRole('option', { name: employeeCode }).or(
      page.getByText(employeeCode),
    );
    await option.click({ timeout: 10_000 });
  }

  async send(subject, message) {
    const { page } = this;
    const subjectField = page.getByRole('textbox', { name: 'Tiêu đề:', exact: true });
    await subjectField.fill(subject, { timeout: 10_000 });
    const editor = page.getByRole('application', { name: 'Rich Text Editor' })
      .getByRole('textbox', { name: /Editor editing area/i });
    await editor.fill(message, { timeout: 10_000 });
    const sendButton = page.getByRole('button', { name: 'Gửi', exact: true });
    await expect(sendButton).toBeVisible({ timeout: 10_000 });
    await expect(sendButton).toBeEnabled({ timeout: 10_000 });
    await sendButton.press('Space', { timeout: 10_000 });
    await expect(page).toHaveURL(/\/internal_mail\/(inbox|sent)(?:[?#]|$)/, { timeout: 15_000 });
  }

  async expectSent(subject) {
    const { page } = this;
    await page.goto(mailOrigin + sentPath, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('table').getByText(subject, { exact: true })).toBeVisible({ timeout: 20_000 });
  }

  async expectReceived(subject, message) {
    const { page } = this;
    const mail = page.getByRole('table').getByText(subject, { exact: true });
    await expect(async () => {
      await page.goto(mailOrigin + inboxPath, { waitUntil: 'domcontentloaded', timeout: 10_000 });
      await expect(page).toHaveURL(mailOrigin + inboxPath, { timeout: 4_000 });
      await expect(mail).toBeVisible({ timeout: 4_000 });
    }).toPass({ timeout: 25_000, intervals: [1_000, 2_000, 4_000] });
    await mail.click();
    const openedMessage = page.getByLabel(/Editor editing area: main/i);
    await expect(openedMessage.getByText(message, { exact: true })).toBeVisible();
  }
}

module.exports = { InternalMailPage, composePath, inboxPath, sentPath };
