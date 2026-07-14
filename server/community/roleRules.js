const ROLE_DEFINITIONS = {
  verifiedWallet: { label: 'Verified Wallet', automatic: true },
  participant: { label: 'Active Participant', automatic: true },
  matureParticipant: { label: 'Mature Participant', automatic: true },
  observerOperator: { label: 'Observer Operator', automatic: false },
  publicObserver: { label: 'Public Observer', automatic: false },
  builder: { label: 'Builder', automatic: false },
  earlyAlpha: { label: 'Early Alpha', automatic: false }
};

function evaluateAutomaticRoles(identity, addressState) {
  const participant = addressState?.participant || null;
  const active = participant?.status === 'active';
  return {
    verifiedWallet: identity?.status === 'linked',
    participant: active,
    matureParticipant: active && Number(participant?.rewardMaturityPercent) === 100
  };
}

function rolePresentation(states) {
  return (states || [])
    .filter((state) => state.applied === 1 || state.applied === true)
    .map((state) => ({ key: state.roleKey, label: ROLE_DEFINITIONS[state.roleKey]?.label || state.roleKey }));
}

module.exports = { ROLE_DEFINITIONS, evaluateAutomaticRoles, rolePresentation };
