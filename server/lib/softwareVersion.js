const { version: packageVersion } = require('../../package.json');

const VERSION_RE = /^[0-9A-Za-z][0-9A-Za-z._-]{0,31}$/;

function getSoftwareVersion(config = {}) {
  const candidate = process.env.SPARGE_SOFTWARE_VERSION
    || config.node?.softwareVersion
    || packageVersion;
  return typeof candidate === 'string' && VERSION_RE.test(candidate)
    ? candidate
    : 'unknown';
}

module.exports = { getSoftwareVersion };
