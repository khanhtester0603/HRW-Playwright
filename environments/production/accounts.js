const { accountForSite } = require('../../fixtures/role-accounts');

module.exports = { accountForRole: (role) => accountForSite('haraworks', role) };
