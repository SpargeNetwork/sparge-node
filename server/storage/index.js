const { SqliteStorage } = require('./sqliteStorage');
const { JsonStorage } = require('./jsonStorage');

function createStorage(dataDir, config) {
  const backend = (config.storage && config.storage.backend) || 'sqlite';
  if (backend === 'json') {
    return new JsonStorage(dataDir, config);
  }
  return new SqliteStorage(dataDir, config);
}

module.exports = { createStorage };
