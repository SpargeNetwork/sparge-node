function toBaseUnits(tokenAmountString, decimals) {
  const [whole, fraction = ''] = tokenAmountString.split('.');
  const padded = (fraction + '0'.repeat(decimals)).slice(0, decimals);
  const digits = `${whole}${padded}`.replace(/^0+(?=\d)/, '');
  return BigInt(digits || '0');
}

function formatTokens(baseUnits, decimals) {
  const negative = baseUnits < 0n;
  const value = negative ? -baseUnits : baseUnits;
  const s = value.toString().padStart(decimals + 1, '0');
  const whole = s.slice(0, -decimals);
  const fraction = s.slice(-decimals).replace(/0+$/, '');
  return `${negative ? '-' : ''}${whole}${fraction ? '.' + fraction : ''}`;
}

module.exports = { toBaseUnits, formatTokens };