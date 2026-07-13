function createMiner(blockchain, config) {
  let mining = false;
  let timer = null;

  function mineOnce() {
    if (!mining) return;
    if (typeof blockchain.canMint === 'function' && !blockchain.canMint()) {
      stop();
      return;
    }
    blockchain.mineNextBlock();
  }

  function start() {
    if (mining) return false;
    if (typeof blockchain.canMint === 'function' && !blockchain.canMint()) return false;
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
    const pausedForSafety = typeof blockchain.canMint === 'function' ? !blockchain.canMint() : false;
    return { active: mining, pausedForSafety };
  }

  return { start, stop, status };
}

module.exports = { createMiner };
