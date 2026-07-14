const assert = require('assert');
const fs = require('fs');
const path = require('path');
const YAML = require('yaml');
const participantUi = require('../public/participant-ui');

const root = path.join(__dirname, '..');
const state = {
  maxSponsoredParticipants: 10,
  participantRewardRamp: {
    activationHeight: 1000,
    stages: [
      { blocks: 5100, multiplierPercent: 25 },
      { blocks: 10200, multiplierPercent: 60 },
      { blocks: null, multiplierPercent: 100 }
    ]
  }
};

function participant(age, percent, stage, status = 'active', rampActive = true) {
  return {
    registeredHeight: '203',
    maturityAgeBlocks: String(age),
    rewardMaturityPercent: percent,
    rewardMaturityMultiplierBps: percent * 100,
    rewardMaturityStage: stage,
    blocksUntilNextMaturityStage: age <= 5100 ? 5101 - age : age <= 10200 ? 10201 - age : null,
    status,
    rewardRampActive: rampActive
  };
}

const newView = participantUi.maturityPresentation(participant(1234, 25, 'New'), state);
assert.strictEqual(newView.percent, 25, '25% stage renders');
assert.strictEqual(newView.stage, 'New');
assert.strictEqual(newView.multiplierLabel, '0.25×');
assert.strictEqual(newView.targetBlock, 5304, 'next stage target derives from registered height');
assert.ok(newView.progress > 0 && newView.progress < 100, 'progress reflects progress within current stage');

const growingView = participantUi.maturityPresentation(participant(6000, 60, 'Growing'), state);
assert.strictEqual(growingView.percent, 60, '60% stage renders');
assert.strictEqual(growingView.multiplierLabel, '0.60×');
const matureView = participantUi.maturityPresentation(participant(10201, 100, 'Mature'), state);
assert.strictEqual(matureView.percent, 100, '100% stage renders');
assert.strictEqual(matureView.progress, 100);

const inactive = participantUi.maturityPresentation(participant(6000, 60, 'Growing', 'inactive'), state);
assert.strictEqual(inactive.eligibilityLabel, 'Inactive · rewards paused', 'inactive participant shows paused rewards');
assert.strictEqual(inactive.age, growingView.age, 'inactivity does not display as a maturity reset');
const preActivation = participantUi.explanation(participant(50, 100, 'Mature', 'active', false), state, String);
assert.ok(preActivation.includes('activates at block 1000'), 'pre-activation state is explained');
assert.ok(preActivation.includes('legacy full reward'), 'legacy reward behavior is explicit');

const sponsorship = participantUi.sponsorshipSummary({
  sponsoredActiveCount: 3,
  sponsoredInactiveCount: 2,
  availableSponsorSlots: 7,
  reclaimableBondMicro: null
}, state);
assert.deepStrictEqual(sponsorship, { active: 3, inactive: 2, available: 7, maximum: 10, reclaimable: null }, 'sponsor dashboard distinguishes protocol-active records and slots');
assert.strictEqual(sponsorship.reclaimable, null, 'reclaimable bond is not falsely available');

const walletHtml = fs.readFileSync(path.join(root, 'public', 'wallet.html'), 'utf8');
const addressHtml = fs.readFileSync(path.join(root, 'public', 'address.html'), 'utf8');
const appJs = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
assert.ok(walletHtml.includes('id="participantMaturityCard"'), 'participant wallet has a dedicated maturity card');
assert.ok(walletHtml.includes('role="progressbar"'), 'maturity progress is accessible');
assert.ok(walletHtml.includes('id="walletSponsorshipsCard"'), 'wallet has a sponsorship dashboard');
assert.ok(addressHtml.includes('id="addressParticipationCard"'), 'participant address page has a visible participation card');
assert.ok(appJs.includes('sponsoredParticipants'), 'sponsor dashboard renders individual public records');
assert.ok(appJs.includes('Not available in this protocol version'), 'UI does not imply Sponsor reclaim exists');

const publicDocs = ['protocol.md', 'faq.md', 'wallet.md', 'rpc.md']
  .map((file) => fs.readFileSync(path.join(root, 'docs', file), 'utf8'))
  .join('\n');
assert.ok(publicDocs.includes('receives no commission or reward share'), 'docs explicitly state Sponsor receives no reward share');
assert.ok(publicDocs.includes('Inactivity pauses rewards but does not'), 'docs preserve maturity across inactivity');
assert.ok(publicDocs.includes('Sponsor reclaim is unavailable'), 'docs disclose reclaim limitation');
assert.ok(publicDocs.includes('block heights 0 through 999'), 'docs explicitly describe the pre-activation block range');
assert.ok(publicDocs.includes('activates at block height 1,000'), 'docs explicitly describe the maturity activation height');
assert.ok(publicDocs.includes('age still accumulates before activation'), 'docs explain that registration age does not reset at activation');
assert.ok(publicDocs.includes('declines linearly by block to 2%'), 'docs explain the emission schedule');
assert.ok(publicDocs.includes('23,717'), 'docs disclose the block-based payout interval');
assert.ok(publicDocs.includes('complete accumulated balances of both pools are processed'), 'docs explain that payouts process the complete pools');
assert.ok(publicDocs.includes('Each pool is set to zero after processing'), 'docs explain that pools reset after payout');
assert.ok(publicDocs.includes('complete Holder Pool goes to Treasury'), 'docs disclose the no-eligible-holder fallback');
assert.ok(publicDocs.includes('complete Node Pool goes to Treasury'), 'docs disclose the no-stake fallback');
assert.ok(publicDocs.includes('Running an observer does not create stake'), 'docs do not imply observer reward eligibility');
assert.ok(publicDocs.includes('no supported `stake` transaction'), 'docs disclose the missing public staking flow');
assert.ok(!/sponsor (earns|receives) (a |any )?(percentage|commission)/i.test(publicDocs), 'docs never claim Sponsor revenue sharing');

const mkdocs = fs.readFileSync(path.join(root, 'mkdocs.yml'), 'utf8');
const mkdocsConfig = YAML.parse(mkdocs);
const gettingStarted = fs.readFileSync(path.join(root, 'docs', 'getting-started.md'), 'utf8');
const publicRpc = fs.readFileSync(path.join(root, 'docs', 'rpc.md'), 'utf8');
assert.strictEqual(mkdocsConfig.docs_dir, 'docs', 'MkDocs YAML parses with the expected documentation root');
assert.ok(mkdocs.includes('exclude_docs:') && mkdocs.includes('internal/'), 'internal maintainer docs are excluded from the public build');
assert.ok(!mkdocs.includes('- Operator Guide:'), 'operator guide is absent from public navigation');
assert.ok(!mkdocs.includes('reference/configuration.md'), 'chain configuration is absent from public navigation');
assert.ok(!gettingStarted.includes('npm start') && !gettingStarted.includes('mine:start'), 'public onboarding does not teach producer startup or mining');
assert.ok(!publicRpc.includes('/api/operator/status') && !publicRpc.includes('/api/mining/start'), 'public API docs omit private operator controls');
assert.ok(fs.existsSync(path.join(root, 'docs', 'internal', 'index.md')), 'maintainers retain a separate internal documentation index');
assert.ok(fs.existsSync(path.join(root, 'docs', 'internal', 'operator-guide.md')), 'operator documentation remains available internally');
assert.ok(fs.existsSync(path.join(root, 'docs', 'internal', 'configuration.md')), 'configuration documentation remains available internally');

console.log('Participant UI and documentation tests passed.');
