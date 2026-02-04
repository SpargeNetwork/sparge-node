function createMiner(blockchain, config) {
  let mining = false;
  let timer = null;

  function mineOnce() {
    if (!mining) return;
    blockchain.mineNextBlock();
  }

  function start() {
    if (mining) return false;
    mining = true;
    const intervalMs = config.chain.blockTimeSeconds * 1000;
    timer = setInterval(mineOnce, intervalMs);
    return true;
  }

  function stop() {
    mining = false;
    if (timer) clearInterval(timer);
    timer = null;
    return true;
  }

  function status() {
    return { active: mining };
  }

  return { start, stop, status };
}

module.exports = { createMiner };
