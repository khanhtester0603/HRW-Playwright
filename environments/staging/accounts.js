const { accountForSite } = require('../../fixtures/role-accounts');

module.exports = { accountForRole: (role = 'default') => accountForSite('zuizui', role) };
