const MULTIPLIER_SCALE = 10_000n;
const DEFAULT_ACTIVE_WINDOW_BLOCKS = 5100;
const DEFAULT_BOND_MICRO = '50000000';
const DEFAULT_MAX_SPONSORED_PARTICIPANTS = 10;

function normalizeParticipationConfig(config) {
  if (!config.economics) config.economics = {};
  if (!config.economics.participation) config.economics.participation = {};
  const participation = config.economics.participation;
  if (participation.activeWindowBlocks === undefined) participation.activeWindowBlocks = DEFAULT_ACTIVE_WINDOW_BLOCKS;
  if (participation.bondMicro === undefined) participation.bondMicro = DEFAULT_BOND_MICRO;
  if (participation.maxSponsoredParticipants === undefined) participation.maxSponsoredParticipants = DEFAULT_MAX_SPONSORED_PARTICIPANTS;
  if (!Number.isSafeInteger(Number(participation.activeWindowBlocks)) || Number(participation.activeWindowBlocks) <= 0) {
    throw new Error('economics.participation.activeWindowBlocks must be a positive safe integer');
  }
  if (!/^(0|[1-9][0-9]*)$/.test(String(participation.bondMicro))) {
    throw new Error('economics.participation.bondMicro must be a non-negative integer string');
  }
  if (!Number.isSafeInteger(Number(participation.maxSponsoredParticipants)) || Number(participation.maxSponsoredParticipants) <= 0) {
    throw new Error('economics.participation.maxSponsoredParticipants must be a positive safe integer');
  }
  participation.activeWindowBlocks = Number(participation.activeWindowBlocks);
  participation.bondMicro = String(participation.bondMicro);
  participation.maxSponsoredParticipants = Number(participation.maxSponsoredParticipants);
  return participation;
}

function parseMultiplierBps(value, field) {
  const text = String(value).trim();
  if (!/^(0|1)(\.[0-9]{1,4})?$/.test(text)) {
    throw new Error(`${field} must be a decimal between 0 and 1 with at most 4 decimal places`);
  }
  const [whole, fraction = ''] = text.split('.');
  const bps = BigInt(whole) * MULTIPLIER_SCALE + BigInt((fraction + '0000').slice(0, 4));
  if (bps < 0n || bps > MULTIPLIER_SCALE) {
    throw new Error(`${field} must be between 0 and 1`);
  }
  return Number(bps);
}

function normalizeParticipantRewardRamp(config) {
  if (!config.economics) config.economics = {};
  if (!config.economics.participantRewardRamp) config.economics.participantRewardRamp = {};
  const ramp = config.economics.participantRewardRamp;
  if (ramp.enabled === undefined) ramp.enabled = false;
  if (typeof ramp.enabled !== 'boolean') throw new Error('economics.participantRewardRamp.enabled must be boolean');
  if (ramp.activationHeight === undefined || ramp.activationHeight === null) ramp.activationHeight = 0;
  if (!Number.isSafeInteger(Number(ramp.activationHeight)) || Number(ramp.activationHeight) < 0) {
    throw new Error('economics.participantRewardRamp.activationHeight must be a non-negative safe integer');
  }
  ramp.activationHeight = Number(ramp.activationHeight);
  if (!Array.isArray(ramp.stages) || !ramp.stages.length) {
    ramp.stages = [
      { blocks: 5100, multiplier: '0.25' },
      { blocks: 10200, multiplier: '0.60' },
      { blocks: null, multiplier: '1.00' }
    ];
  }

  let previousBlocks = -1;
  let terminalSeen = false;
  ramp.stages = ramp.stages.map((stage, index) => {
    if (!stage || typeof stage !== 'object' || Array.isArray(stage)) {
      throw new Error(`economics.participantRewardRamp.stages[${index}] must be an object`);
    }
    const field = `economics.participantRewardRamp.stages[${index}]`;
    const blocks = stage.blocks === null
      ? null
      : Number(stage.blocks);
    if (blocks === null) {
      if (index !== ramp.stages.length - 1) throw new Error(`${field}.blocks null is only allowed for the final stage`);
      terminalSeen = true;
    } else if (!Number.isSafeInteger(blocks) || blocks < 0 || blocks <= previousBlocks) {
      throw new Error(`${field}.blocks must increase as non-negative safe integers`);
    } else {
      previousBlocks = blocks;
    }
    const multiplierBps = parseMultiplierBps(stage.multiplier, `${field}.multiplier`);
    return { blocks, multiplier: String(stage.multiplier), multiplierBps };
  });
  if (!terminalSeen) throw new Error('economics.participantRewardRamp.stages must end with blocks: null');
  return ramp;
}

function participantMaturity(record, height, ramp) {
  const currentHeight = BigInt(height ?? 0);
  const registeredHeight = BigInt(record?.registeredHeight ?? 0);
  const ageBlocks = currentHeight > registeredHeight ? currentHeight - registeredHeight : 0n;
  const active = ramp?.enabled === true && currentHeight >= BigInt(ramp.activationHeight || 0);
  if (!active) {
    return {
      ageBlocks,
      multiplierBps: 10_000,
      multiplierPercent: 100,
      stage: 'Mature',
      blocksUntilNextStage: null,
      rampActive: false
    };
  }

  for (let index = 0; index < ramp.stages.length; index += 1) {
    const stage = ramp.stages[index];
    if (stage.blocks === null || ageBlocks <= BigInt(stage.blocks)) {
      const next = ramp.stages[index + 1] || null;
      return {
        ageBlocks,
        multiplierBps: stage.multiplierBps,
        multiplierPercent: stage.multiplierBps / 100,
        stage: index === 0 ? 'New' : next ? 'Growing' : 'Mature',
        blocksUntilNextStage: stage.blocks === null ? null : Number(BigInt(stage.blocks) - ageBlocks + 1n),
        rampActive: true
      };
    }
  }
  throw new Error('Participant reward ramp has no terminal stage.');
}

function matureParticipantShare(baseShare, maturity) {
  return (BigInt(baseShare) * BigInt(maturity.multiplierBps)) / MULTIPLIER_SCALE;
}

function calculateMaturedParticipantRewards({ participantUnits, activeAddresses, participants, height, ramp }) {
  const pool = BigInt(participantUnits);
  const active = [...(activeAddresses || [])].sort((a, b) => a.localeCompare(b));
  if (!active.length) return { baseShare: pool, rewards: [], treasuryRemainder: pool };
  const baseShare = pool / BigInt(active.length);
  const rewards = active.map((address) => {
    const maturity = participantMaturity(participants[address], height, ramp);
    return { address, amount: matureParticipantShare(baseShare, maturity), maturity };
  });
  const distributed = rewards.reduce((sum, reward) => sum + reward.amount, 0n);
  return { baseShare, rewards, treasuryRemainder: pool - distributed };
}

module.exports = {
  MULTIPLIER_SCALE,
  normalizeParticipationConfig,
  normalizeParticipantRewardRamp,
  participantMaturity,
  matureParticipantShare,
  calculateMaturedParticipantRewards
};
