function createMiner(blockchain, config, logger = null) {
  let mining = false;
  let timer = null;

  function mineOnce() {
    if (!mining) return;
    if (typeof blockchain.canMint === 'function' && !blockchain.canMint()) {
      stop();
      if (logger) logger.warn('producer_mining_paused', {
        operation: 'mining',
        status: 'paused_for_safety'
      }, 'Mining paused for safety');
      return;
    }
    blockchain.mineNextBlock();
  }

  function start() {
    if (mining) return false;
    if (typeof blockchain.canMint === 'function' && !blockchain.canMint()) return false;
    mining = true;
    const intervalMs = config.chain.blockTimeSeconds * 1000;
    if (logger) logger.info('producer_mining_started', {
      operation: 'mining',
      intervalMs
    }, 'Producer mining started');
    timer = setInterval(mineOnce, intervalMs);
    return true;
  }

  function stop() {
    const wasMining = mining;
    mining = false;
    if (timer) clearInterval(timer);
    timer = null;
    if (wasMining && logger) logger.info('producer_mining_stopped', {
      operation: 'mining'
    }, 'Producer mining stopped');
    return true;
  }

  function status() {
    const pausedForSafety = typeof blockchain.canMint === 'function' ? !blockchain.canMint() : false;
    return { active: mining, pausedForSafety };
  }

  return { start, stop, status };
}

module.exports = { createMiner };
