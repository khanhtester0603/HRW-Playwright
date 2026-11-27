const { test: base, expect } = require('./platform-test');
const { accountForRole } = require('../environments/staging/accounts');
const { openOrgForm, selectOrganization, submitLogin, expectWorkplace } = require('../environments/staging/pages/login-page');

const test = base.extend({
  role: [null, { option: true }],
  trace: 'off',
  screenshot: 'off',
  video: 'off',
  page: async ({ page, role }, use) => {
    if (role !== null) {
      const account = accountForRole(role);
      if (!account.org || !account.username || !account.password) {
        throw new Error(`Thiếu cấu hình tài khoản Zuizui cho role "${role}". Xem README.`);
      }
      await selectOrganization(page, account.org);
      await submitLogin(page, account);
      await expectWorkplace(page);
    }
    await use(page);
  },
});

module.exports = { test, expect, accountForRole, openOrgForm, selectOrganization, submitLogin, expectWorkplace };
