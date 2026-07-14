(function initParticipantUi(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SpargeParticipantUi = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function participantUiFactory() {
  function maturityPresentation(participant, state) {
    const age = Number(participant?.maturityAgeBlocks ?? 0);
    const registered = Number(participant?.registeredHeight ?? 0);
    const stages = Array.isArray(state?.participantRewardRamp?.stages) ? state.participantRewardRamp.stages : [
      { blocks: 5100, multiplierPercent: 25 },
      { blocks: 10200, multiplierPercent: 60 },
      { blocks: null, multiplierPercent: 100 }
    ];
    const stageIndex = stages.findIndex((stage) => stage.blocks === null || age <= Number(stage.blocks));
    const current = stageIndex >= 0 ? stages[stageIndex] : null;
    const next = stageIndex >= 0 ? stages[stageIndex + 1] : null;
    const startAge = stageIndex > 0 ? Number(stages[stageIndex - 1].blocks) + 1 : 0;
    const transitionAge = current?.blocks === null ? null : Number(current.blocks) + 1;
    const progress = transitionAge === null
      ? 100
      : Math.max(0, Math.min(100, ((age - startAge) / Math.max(1, transitionAge - startAge)) * 100));
    const multiplierBps = Number(participant?.rewardMaturityMultiplierBps ?? 10000);
    return {
      age,
      registered,
      progress,
      blocksRemaining: participant?.blocksUntilNextMaturityStage ?? null,
      targetBlock: transitionAge === null ? null : registered + transitionAge,
      nextPercent: next?.multiplierPercent ?? null,
      percent: Number(participant?.rewardMaturityPercent ?? 100),
      stage: participant?.rewardMaturityStage ?? 'Mature',
      multiplierLabel: `${(multiplierBps / 10000).toFixed(2)}×`,
      eligibilityLabel: participant?.status === 'active' ? 'Active' : 'Inactive · rewards paused'
    };
  }

  function explanation(participant, state, formatNumber = String) {
    return participant?.rewardRampActive
      ? 'Participant rewards increase as this wallet remains registered over time. Inactivity pauses rewards but does not reset maturity.'
      : `Reward maturation activates at block ${formatNumber(state?.participantRewardRamp?.activationHeight ?? 1000)}. Until then, participants receive the legacy full reward calculation.`;
  }

  function sponsorshipSummary(stats, state) {
    const max = Number(state?.maxSponsoredParticipants ?? 10);
    return {
      active: Number(stats?.sponsoredActiveCount ?? 0),
      inactive: Number(stats?.sponsoredInactiveCount ?? 0),
      available: Number(stats?.availableSponsorSlots ?? max),
      maximum: max,
      reclaimable: stats?.reclaimableBondMicro ?? null
    };
  }

  return { maturityPresentation, explanation, sponsorshipSummary };
}));
