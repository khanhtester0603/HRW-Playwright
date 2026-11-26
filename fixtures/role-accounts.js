const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { parseEnv } = require('node:util');

function accountForSite(site, role) {
  if (typeof role !== 'string' || !/^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/.test(role)) {
    throw new Error('Role phải dùng chữ thường, chữ số hoặc dấu gạch dưới và bắt đầu bằng chữ cái.');
  }

  let local = {};
  try {
    local = parseEnv(readFileSync(resolve(__dirname, `../.env.${site}.local`), 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  const value = key => process.env[key] || local[key];
  const appPrefix = site.toUpperCase();
  const rolePrefix = role === 'default' ? appPrefix : `${appPrefix}_${role.toUpperCase()}`;
  return {
    org: value(`${rolePrefix}_ORG_CODE`) || value(`${appPrefix}_ORG_CODE`),
    username: value(`${rolePrefix}_USERNAME`),
    password: value(`${rolePrefix}_PASSWORD`),
  };
}

module.exports = { accountForSite };
