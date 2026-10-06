const state = {
  winType: 'ron',
  seat: 'nonDealer',
  handStatus: 'closed',
  waitFu: 0,
  pairFu: 0,
  meldCount: 0,
  kanCount: 0,
  melds: [],
  yakuhaiCount: 0,
  bonusHan: 0,
  honba: 0,
  riichiStick: false,
  yakuman: false,
    selectedYakus: new Set(),
};

const settlementStorageKey = 'sanma-score-settlement-v1';
const defaultSettlement = {
  initial: {
    A: { name: 'プレイヤー A' },
    B: { name: 'プレイヤー B' },
    C: { name: 'プレイヤー C' },
  },
  startPoint: 35000,
  setupComplete: false,
  players: {},
  history: [],
  winner: 'A',
  ronFrom: 'B',
  dealer: 'B',
  oka: 35000,
  uma: 45,
};

function cloneSettlement(value) {
  return JSON.parse(JSON.stringify(value));
}

function playersFromInitial(initial, startPoint) {
  return Object.fromEntries(['A', 'B', 'C'].map((id) => [id, { name: initial[id].name, score: startPoint }]));
}

function loadSettlement() {
  const saved = localStorage.getItem(settlementStorageKey);
  if (!saved) {
    const fresh = cloneSettlement(defaultSettlement);
    fresh.players = playersFromInitial(fresh.initial, fresh.startPoint);
    return fresh;
  }
  try {
    const parsed = JSON.parse(saved);
    const fresh = cloneSettlement(defaultSettlement);
    const parsedInitial = parsed.initial || {};
    fresh.startPoint = Number(parsed.startPoint) > 0 ? Number(parsed.startPoint) : 35000;
    fresh.setupComplete = parsed.setupComplete === true;
    fresh.initial = Object.fromEntries(['A', 'B', 'C'].map((id) => [id, { name: parsedInitial[id]?.name || fresh.initial[id].name }]));
    const hasCommonPointSetting = Number(parsed.startPoint) > 0;
    fresh.players = hasCommonPointSetting ? { ...playersFromInitial(fresh.initial, fresh.startPoint), ...(parsed.players || {}) } : playersFromInitial(fresh.initial, fresh.startPoint);
    fresh.history = hasCommonPointSetting && Array.isArray(parsed.history) ? parsed.history : [];
    fresh.winner = parsed.winner || 'A';
    fresh.ronFrom = parsed.ronFrom || 'B';
    fresh.dealer = parsed.dealer || 'B';
    fresh.oka = Number(parsed.oka) || 35000;
    fresh.uma = Number(parsed.uma) || 45;
    return fresh;
  } catch {
    const fresh = cloneSettlement(defaultSettlement);
    fresh.players = playersFromInitial(fresh.initial, fresh.startPoint);
    return fresh;
  }
}

const settlementState = loadSettlement();

function saveSettlement() {
  localStorage.setItem(settlementStorageKey, JSON.stringify(settlementState));
}

const wizardState = { steps: [], index: 0, returnMode: 'hand' };

const yen = (n) => n.toLocaleString('ja-JP');
const ceil100 = (n) => Math.ceil(n / 100) * 100;

const yakuConflicts = {
  chiitoitsu: ['pinfu', 'toitoi', 'sanankou', 'sankantsu', 'shousangen', 'sanshoku', 'ittsu', 'sanshokuDoukou', 'honchantaiyao', 'junchantaiyao', 'ryanpeikou'],
  pinfu: ['chiitoitsu', 'toitoi', 'sanankou', 'sankantsu', 'shousangen', 'honroutou', 'sanshokuDoukou'],
  toitoi: ['pinfu', 'chiitoitsu', 'sanshoku', 'ittsu', 'honchantaiyao', 'junchantaiyao', 'ryanpeikou'],
  ryanpeikou: ['chiitoitsu', 'toitoi', 'sanankou', 'sankantsu', 'shousangen', 'honroutou', 'sanshoku', 'sanshokuDoukou', 'ittsu'],
  sanshoku: ['chiitoitsu', 'toitoi', 'sanshokuDoukou', 'ittsu'],
  ittsu: ['chiitoitsu', 'toitoi', 'sanshoku', 'sanshokuDoukou', 'sankantsu'],
  sanshokuDoukou: ['chiitoitsu', 'pinfu', 'ryanpeikou', 'sanshoku', 'ittsu'],
  sankantsu: ['pinfu', 'chiitoitsu', 'ryanpeikou', 'sanshoku', 'ittsu'],
  sanankou: ['pinfu', 'chiitoitsu', 'ryanpeikou'],
  shousangen: ['pinfu', 'chiitoitsu', 'ryanpeikou'],
  honroutou: ['pinfu'],
  honchantaiyao: ['chiitoitsu', 'toitoi', 'tanyao', 'junchantaiyao'],
  junchantaiyao: ['chiitoitsu', 'toitoi', 'tanyao', 'honchantaiyao'],
  tanyao: ['honroutou', 'honchantaiyao', 'junchantaiyao'],
  honitsu: ['chinitsu'],
  chinitsu: ['honitsu'],
};

function conflictIds(id) {
  const ids = new Set(yakuConflicts[id] || []);
  Object.entries(yakuConflicts).forEach(([other, conflicts]) => {
    if (conflicts.includes(id)) ids.add(other);
  });
  return ids;
}

function getYakuButton(id) {
  return document.querySelector(`[data-yaku="${id}"]`);
}

function isYakuImpossible(id) {
  const button = getYakuButton(id);
  if (!button) return false;
  if (state.handStatus === 'open' && Number(button.dataset.openHan) === 0) return true;
  if (id === 'ippatsu' && !state.selectedYakus.has('riichi')) return true;
  if (id === 'menzenTsumo' && state.winType !== 'tsumo') return true;
  return [...conflictIds(id)].some((other) => state.selectedYakus.has(other));
}

function normalizeYakuSelection() {
  [...state.selectedYakus].forEach((id) => {
    if (isYakuImpossible(id)) state.selectedYakus.delete(id);
  });
}

function getSelectedHan() {
  if (state.yakuman) return 13;
  const selectedYakuHan = [...state.selectedYakus].reduce((sum, id) => {
    const button = getYakuButton(id);
    if (!button || isYakuImpossible(id)) return sum;
    const value = state.handStatus === 'open' ? button.dataset.openHan : button.dataset.han;
    return sum + Number(value || 0);
  }, 0);
  return selectedYakuHan + state.yakuhaiCount + state.bonusHan;
}

function selectedYakuNames() {
  const names = [...state.selectedYakus].map((id) => {
    const button = getYakuButton(id);
    if (!button || isYakuImpossible(id)) return null;
    return button.querySelector('span')?.textContent;
  }).filter(Boolean);
  if (state.yakuhaiCount) names.push(`役牌×${state.yakuhaiCount}`);
  return names;
}

function limitName(han, fu, yakuman) {
  if (yakuman || han >= 13) return '役満';
  if (han >= 11) return '三倍満';
  if (han >= 8) return '倍満';
  if (han >= 6) return '跳満';
  if (han >= 5 || (han === 4 && fu >= 40) || (han === 3 && fu >= 70)) return '満貫';
  return `${fu}符 ${han}翻`;
}

function basePoints(han, fu, yakuman) {
  if (yakuman || han >= 13) return 8000;
  if (han >= 11) return 6000;
  if (han >= 8) return 4000;
  if (han >= 6) return 3000;
  if (han >= 5 || (han === 4 && fu >= 40) || (han === 3 && fu >= 70)) return 2000;
  return Math.min(fu * Math.pow(2, han + 2), 2000);
}

function syncFuMelds() {
  const meldCount = Math.max(0, Math.min(4, Number(state.meldCount) || 0));
  const kanCount = Math.max(0, Math.min(4 - meldCount, Number(state.kanCount) || 0));
  const previous = Array.isArray(state.melds) ? state.melds : [];
  state.meldCount = meldCount;
  state.kanCount = kanCount;
  state.melds = Array.from({ length: meldCount + kanCount }, (_, index) => ({
    concealed: Boolean(previous[index]?.concealed),
    terminal: Boolean(previous[index]?.terminal),
  }));
}

function calculateFu() {
  const waitFu = Number(state.waitFu);
  const pairFu = Number(state.pairFu);
  const chiitoitsu = state.selectedYakus.has('chiitoitsu');
  const pinfuTsumo = state.selectedYakus.has('pinfu') && state.handStatus === 'closed' && state.winType === 'tsumo';
  if (chiitoitsu) return { fu: 25, breakdown: '七対子は25符固定' };
  if (pinfuTsumo) return { fu: 20, breakdown: '平和ツモは20符固定' };

  const parts = ['基本20符'];
  let rawFu = 20;
  if (state.winType === 'ron' && state.handStatus === 'closed') {
    rawFu += 10;
    parts.push('門前ロン10符');
  } else if (state.winType === 'tsumo') {
    rawFu += 2;
    parts.push('ツモ2符');
  }
  if (waitFu) { rawFu += waitFu; parts.push(`待ち${waitFu}符`); }
  if (pairFu) { rawFu += pairFu; parts.push(`雀頭${pairFu}符`); }

  syncFuMelds();
  state.melds.forEach((meld, index) => {
    const isKan = index >= state.meldCount;
    const value = isKan ? (meld.concealed ? (meld.terminal ? 32 : 16) : (meld.terminal ? 16 : 8)) : (meld.concealed ? (meld.terminal ? 8 : 4) : (meld.terminal ? 4 : 2));
    const label = `${meld.concealed ? '暗' : '明'}${isKan ? '槓' : '刻'}・${meld.terminal ? '幺九牌' : '中張牌'}`;
    rawFu += value;
    parts.push(`${label}${value}符`);
  });

  let fu = Math.ceil(rawFu / 10) * 10;
  if (state.winType === 'ron' && fu === 20) fu = 30;
  if (fu !== rawFu) parts.push(`${rawFu}符を切り上げ`);
  return { fu, breakdown: parts.join(' ＋ ') };
}

function calculateHand(options = {}) {
  const han = getSelectedHan();
  const { winType, seat, riichiStick } = state;
  const honba = Math.max(0, Number(state.honba) || 0);
  const yakuman = state.yakuman;
  const fuInfo = calculateFu();
  const fu = fuInfo.fu;
  const base = basePoints(han, fu, yakuman);
  const dealer = (options.seat || seat) === 'dealer';
  const isLimit = base >= 2000;
  const payments = [];
  let total;
  const label = `${dealer ? '親' : '子'}・${winType === 'ron' ? 'ロン' : 'ツモ'}`;

  if (winType === 'ron') {
    const ron = ceil100(base * (dealer ? 6 : 4));
    const honbaPoints = honba * 300;
    total = ron + honbaPoints + (riichiStick ? 1000 : 0);
    payments.push({ label: '放銃者から', value: ron + honbaPoints });
  } else if (dealer) {
    const each = ceil100(base * 2);
    const honbaEach = honba * 100;
    payments.push({ label: '下家から', value: each + honbaEach }, { label: '対面から', value: each + honbaEach });
    total = payments.reduce((sum, payment) => sum + payment.value, 0) + (riichiStick ? 1000 : 0);
  } else {
    const dealerPay = ceil100(base * 2) + honba * 100;
    const otherPay = ceil100(base) + honba * 100;
    payments.push({ label: '親から', value: dealerPay }, { label: '子から', value: otherPay });
    total = payments.reduce((sum, payment) => sum + payment.value, 0) + (riichiStick ? 1000 : 0);
  }

  const title = isLimit ? limitName(han, fu, yakuman) : `${fu}符 ${han}翻`;
  const detail = `${title}${honba ? ` ・ ${honba}本場` : ''}`;
  return { total, payments, label, detail, isLimit, riichiStick, honba, han, fu, fuInfo, yakuman };
}

function renderYakuState() {
  normalizeYakuSelection();
  const han = getSelectedHan();
  document.querySelector('#han-value').textContent = han;
  document.querySelector('#bonus-han-value').textContent = state.bonusHan;
  document.querySelector('#yakuhai-count-value').textContent = state.yakuhaiCount;
  document.querySelectorAll('.yaku-option').forEach((button) => {
    const id = button.dataset.yaku;
    const impossible = isYakuImpossible(id);
    button.disabled = impossible;
    button.classList.toggle('is-selected', state.selectedYakus.has(id) && !impossible);
    button.classList.toggle('is-disabled', impossible);
    button.classList.toggle('is-hidden', impossible);
  });
  const closedVisible = [...document.querySelectorAll('#yaku-list-closed .yaku-option')].some((button) => !button.classList.contains('is-hidden'));
  const normalVisible = [...document.querySelectorAll('#normal-yaku-label + .yaku-list .yaku-option')].some((button) => !button.classList.contains('is-hidden'));
  document.querySelector('#closed-yaku-label').classList.toggle('is-hidden', !closedVisible);
  document.querySelector('#normal-yaku-label').classList.toggle('is-hidden', !normalVisible);
  document.querySelector('#yakuman-option').classList.toggle('is-selected', state.yakuman);
  const waitToggle = document.querySelector('#wait-fu-toggle');
  if (waitToggle) {
    const waitSelected = Number(state.waitFu) > 0;
    waitToggle.classList.toggle('is-selected', waitSelected);
    waitToggle.setAttribute('aria-pressed', String(waitSelected));
  }
  const pairFixed = state.selectedYakus.has('tanyao') || state.selectedYakus.has('junchantaiyao');
  if (pairFixed) {
    state.pairFu = 0;
    document.querySelector('#pair-fu').value = '0';
  }
  document.querySelector('#pair-fu-row').classList.toggle('is-hidden', pairFixed);
  const fixedFu = state.yakuman || state.selectedYakus.has('chiitoitsu') || state.selectedYakus.has('pinfu');
  const fuNotRequired = state.yakuman || han >= 5;
  const fuField = document.querySelector('#fu-field');
  const fuDetails = document.querySelector('#fu-details');
  fuField.classList.toggle('is-hidden', fuNotRequired);
  fuDetails.classList.toggle('is-hidden', fixedFu);
  fuDetails.classList.toggle('is-disabled', fuNotRequired && !fixedFu);
  fuDetails.setAttribute('aria-disabled', String(fuNotRequired && !fixedFu));
  fuDetails.querySelectorAll('button, select').forEach((control) => { control.disabled = fuNotRequired && !fixedFu; });
}

function renderToggles() {
  const dealerOn = state.seat === 'dealer';
  const openOn = state.handStatus === 'open';
  const dealerToggle = document.querySelector('#dealer-toggle');
  const openToggle = document.querySelector('#open-toggle');
  dealerToggle.classList.toggle('is-on', dealerOn);
  dealerToggle.setAttribute('aria-pressed', String(dealerOn));
  openToggle.classList.toggle('is-on', openOn);
  openToggle.setAttribute('aria-pressed', String(openOn));
}

function renderFuMeldState() {
  const selection = document.querySelector('#fu-meld-selection');
  const grid = document.querySelector('#fu-meld-grid');
  if (!selection || !grid) return;
  const noTriplets = state.selectedYakus.has('ryanpeikou');
  if (noTriplets) {
    state.meldCount = 0;
    state.kanCount = 0;
  }
  syncFuMelds();
  selection.classList.toggle('is-hidden', noTriplets);
  const forceConcealed = state.handStatus === 'closed';
  const forceSimple = state.selectedYakus.has('tanyao');
  const forceTerminal = state.selectedYakus.has('honroutou') || state.selectedYakus.has('junchantaiyao');
  state.melds.forEach((meld) => {
    if (forceConcealed) meld.concealed = true;
    if (forceSimple) meld.terminal = false;
    if (forceTerminal) meld.terminal = true;
  });
  grid.innerHTML = state.melds.map((meld, index) => {
    const isKan = index >= state.meldCount;
    const groupName = isKan ? '槓子' : '刻子';
    const concealedLabel = `${meld.concealed ? '暗' : '明'}${isKan ? '槓' : '刻'}`;
    const terminalLabel = meld.terminal ? '幺九牌' : '中張牌';
    const fu = isKan ? (meld.concealed ? (meld.terminal ? 32 : 16) : (meld.terminal ? 16 : 8)) : (meld.concealed ? (meld.terminal ? 8 : 4) : (meld.terminal ? 4 : 2));
    const concealedControl = forceConcealed ? `<span class="fu-toggle is-fixed">${concealedLabel}</span>` : `<button class="fu-toggle ${meld.concealed ? 'is-selected' : ''}" data-meld-toggle="concealed" data-meld-index="${index}" type="button">${concealedLabel}</button>`;
    const terminalControl = forceSimple || forceTerminal ? `<span class="fu-toggle is-fixed">${terminalLabel}</span>` : `<button class="fu-toggle ${meld.terminal ? 'is-selected' : ''}" data-meld-toggle="terminal" data-meld-index="${index}" type="button">${terminalLabel}</button>`;
    return `<div class="fu-meld-row" data-meld-index="${index}"><span class="fu-meld-label"><strong>${groupName} ${index + 1}</strong><em>${fu}符</em></span><div class="fu-toggle-group">${concealedControl}${terminalControl}</div></div>`;
  }).join('');
  const fuDisabled = document.querySelector('#fu-details')?.classList.contains('is-disabled');
  grid.querySelectorAll('button').forEach((button) => { button.disabled = fuDisabled; });
}

function renderStepperValues() {
  document.querySelectorAll('[data-step]').forEach((button) => {
    const key = button.dataset.step;
    const value = document.querySelector(`#${key}-value`);
    if (value) value.textContent = state[key];
    const row = button.closest('.fu-meld-row, .bonus-row, .stepper-input, .fu-count-row');
    if (row) row.classList.toggle('is-selected', Number(state[key]) > 0);
  });
}

function renderHand() {
  renderToggles();
  renderYakuState();
  renderFuMeldState();
  renderStepperValues();
  const result = calculateHand();
  document.querySelector('#header-score').textContent = yen(result.total);
  document.querySelector('#honba-value').textContent = state.honba;
  document.querySelector('#fu-value').textContent = result.fu;
  document.querySelector('#fu-breakdown').textContent = result.fuInfo.breakdown;
  document.querySelector('#result-label').textContent = result.label;
  document.querySelector('#result-total').textContent = yen(result.total);
  document.querySelector('#result-detail').textContent = result.detail;
  document.querySelector('#payment-list').innerHTML = result.payments.map((payment) => `
    <div class="payment-item"><span>${payment.label}</span><span>${yen(payment.value)}点</span></div>`).join('');
  const note = document.querySelector('#result-note');
  const notes = [];
  if (result.honba) notes.push(`本場 ${result.honba * 300}点を加算`);
  if (result.riichiStick) notes.push('供託1,000点を加算');
  note.textContent = notes.length ? notes.join(' / ') : '本場・供託は含まれていません';
  note.classList.toggle('is-warning', notes.length > 0);
  const names = result.yakuman ? '役満' : selectedYakuNames().join('・') || '役なし';
  document.querySelector('#reference-text').textContent = `${names} → ${result.total.toLocaleString('ja-JP')}点`;
  renderSettlementHandControls();
}

function setState(key, value) {
  state[key] = value;
  renderHand();
}

document.querySelectorAll('.mode-tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.mode-tab').forEach((item) => item.classList.toggle('is-active', item === tab));
    document.querySelectorAll('.mode-panel').forEach((panel) => panel.classList.toggle('is-active', panel.id === `${tab.dataset.mode}-panel`));
    document.querySelector('.topbar').classList.toggle('is-hidden', tab.dataset.mode === 'match');
    if (tab.dataset.mode === 'match' && !settlementState.setupComplete) openSettlementWizard('setup');
  });
});

document.querySelectorAll('[data-choice-group]').forEach((group) => {
  group.addEventListener('click', (event) => {
    const button = event.target.closest('[data-value]');
    if (!button) return;
    if (group.dataset.choiceGroup === 'waitFu') {
      const isSelected = button.classList.contains('is-selected');
      group.querySelectorAll('.choice').forEach((item) => item.classList.remove('is-selected'));
      state.waitFu = isSelected ? 0 : Number(button.dataset.value);
      renderHand();
      return;
    }
    group.querySelectorAll('.choice').forEach((item) => item.classList.toggle('is-selected', item === button));
    setState(group.dataset.choiceGroup, button.dataset.value);
  });
});

document.querySelectorAll('.yaku-option').forEach((button) => {
  button.addEventListener('click', () => {
    const id = button.dataset.yaku;
    if (state.handStatus === 'open' && Number(button.dataset.openHan) === 0) return;
    if (state.selectedYakus.has(id)) state.selectedYakus.delete(id);
    else {
      conflictIds(id).forEach((other) => state.selectedYakus.delete(other));
      state.selectedYakus.add(id);
    }
    renderHand();
  });
});

document.querySelector('#yakuman-option').addEventListener('click', () => {
  state.yakuman = !state.yakuman;
  renderHand();
});

document.querySelector('#dealer-toggle').addEventListener('click', () => {
  state.seat = state.seat === 'dealer' ? 'nonDealer' : 'dealer';
  settlementState.dealer = state.seat === 'dealer' ? settlementState.winner : (settlementState.dealer === settlementState.winner ? ['A', 'B', 'C'].find((id) => id !== settlementState.winner) : settlementState.dealer);
  saveSettlement();
  renderHand();
});

document.querySelector('#open-toggle').addEventListener('click', () => {
  state.handStatus = state.handStatus === 'open' ? 'closed' : 'open';
  renderHand();
});

document.querySelectorAll('[data-step]').forEach((button) => {
  button.addEventListener('click', () => {
    if (button.closest('#fu-details')?.classList.contains('is-disabled')) return;
    const key = button.dataset.step;
    const max = key === 'meldCount' ? Math.min(4, 4 - state.kanCount) : key === 'kanCount' ? Math.min(4, 4 - state.meldCount) : Number(button.dataset.max || (key === 'yakuhaiCount' ? 4 : 13));
    state[key] = Math.max(0, Math.min(max, state[key] + Number(button.dataset.delta)));
    renderHand();
  });
});

document.querySelector('#fu-meld-grid').addEventListener('click', (event) => {
  if (document.querySelector('#fu-details')?.classList.contains('is-disabled')) return;
  const button = event.target.closest('[data-meld-toggle]');
  if (!button || button.disabled) return;
  const index = Number(button.dataset.meldIndex);
  const property = button.dataset.meldToggle;
  if (!state.melds[index]) return;
  state.melds[index][property] = !state.melds[index][property];
  renderHand();
});

document.querySelector('#pair-fu').addEventListener('change', (event) => setState('pairFu', Number(event.target.value)));
document.querySelector('#riichi-stick-toggle').addEventListener('change', (event) => setState('riichiStick', event.target.checked));

function formatSigned(value) { return `${value > 0 ? '+' : ''}${yen(value)}`; }
function playerName(id) { return settlementState.players[id]?.name || settlementState.initial[id]?.name || id; }
function scoreSnapshot() { return Object.fromEntries(['A', 'B', 'C'].map((id) => [id, Number(settlementState.players[id].score) || 0])); }

function populatePlayerSelect(select, exclude = []) {
  if (!select) return;
  const current = select.value;
  select.innerHTML = ['A', 'B', 'C'].filter((id) => !exclude.includes(id)).map((id) => `<option value="${id}">${id} ${playerName(id)}</option>`).join('');
  if ([...select.options].some((option) => option.value === current)) select.value = current;
}

function renderSettlementSelectors() {
  const winner = document.querySelector('#winner-select');
  const ronFrom = document.querySelector('#ron-from-select');
  const dealer = document.querySelector('#settlement-dealer-select');
  const currentWinner = settlementState.winner;
  const currentDealer = settlementState.dealer;
  winner.innerHTML = ['A', 'B', 'C'].map((id) => `<option value="${id}">${id} ${playerName(id)}</option>`).join('');
  winner.value = currentWinner;
  populatePlayerSelect(ronFrom, [currentWinner]);
  if (settlementState.ronFrom === currentWinner) settlementState.ronFrom = ['A', 'B', 'C'].find((id) => id !== currentWinner);
  ronFrom.value = settlementState.ronFrom;
  populatePlayerSelect(dealer);
  dealer.value = currentDealer;
  document.querySelector('#ron-from-field').classList.toggle('is-hidden', state.winType !== 'ron');
}

function renderSettlementHandControls() {
  const result = calculateHand({ seat: settlementState.dealer === settlementState.winner ? 'dealer' : 'nonDealer' });
  const score = document.querySelector('#settlement-hand-score');
  if (score) score.textContent = `${yen(result.total)}点`;
  renderSettlementSelectors();
}

function renderCurrentScores() {
  const list = document.querySelector('#current-score-list');
  list.innerHTML = ['A', 'B', 'C'].map((id) => `
    <div class="current-score-row">
      <div class="current-score-player"><span class="player-badge player-${id.toLowerCase()}">${id}</span><span>${playerName(id)}</span></div>
      <strong class="current-score-value">${yen(settlementState.players[id].score)}点</strong>
    </div>`).join('');
}

function renderHistory() {
  const list = document.querySelector('#history-list');
  document.querySelector('#history-count').textContent = `${settlementState.history.length}件`;
  if (!settlementState.history.length) {
    list.innerHTML = '<div class="history-empty">まだあがり履歴はありません。</div>';
    return;
  }
  list.innerHTML = settlementState.history.map((entry, index) => `
    <div class="history-item">
      <div class="history-main"><strong>${index + 1}. ${playerName(entry.winner)} ${entry.winType === 'ron' ? 'ロン' : 'ツモ'} ${yen(entry.amount)}点</strong><small>${entry.detail}${entry.payer ? ` ・ ${playerName(entry.payer)}から` : ''} ・ 親 ${playerName(entry.dealer || settlementState.dealer)}</small></div>
      <button class="history-cancel" data-history-id="${entry.id}" type="button">取消</button>
    </div>`).join('');
}

function renderSettlement() {
  renderCurrentScores();
  renderHistory();
  const players = ['A', 'B', 'C'].map((id) => ({ id, name: playerName(id), score: Number(settlementState.players[id].score) || 0 }));
  const returnPoint = Number(settlementState.oka) || 35000;
  const uma = Number(settlementState.uma) || 45;
  players.sort((a, b) => b.score - a.score);
  const umaValues = [uma, 0, -uma];
  players.forEach((player, index) => { player.rank = index + 1; player.settlement = Math.floor((player.score - returnPoint) / 1000) + umaValues[index]; });
  document.querySelector('#settlement-list').innerHTML = players.map((player) => `
    <div class="settlement-row">
      <div class="settlement-player"><span class="rank">0${player.rank}</span><span class="player-badge player-${player.id.toLowerCase()}">${player.id}</span><span>${player.name}</span></div>
      <div class="settlement-points ${player.settlement < 0 ? 'negative' : ''}"><strong>${formatSigned(player.settlement)}</strong><small>${yen(player.score)}点 ・ ウマ ${formatSigned(umaValues[player.rank - 1])}</small></div>
    </div>`).join('');
  const total = players.reduce((sum, player) => sum + player.settlement, 0);
  document.querySelector('#settlement-total').textContent = formatSigned(total);
  renderSettlementHandControls();
}

const wizardStepTitles = {
  setup: '初期設定',
  winner: 'あがり者',
  ronFrom: 'ロンされた人',
  dealer: '親',
  confirm: '内容確認',
};

function syncMatchSetupFields() {
  ['A', 'B', 'C'].forEach((id) => {
    const key = id.toLowerCase();
    const nameInput = document.querySelector(`#player-${key}-name`);
    if (nameInput) nameInput.value = settlementState.initial[id].name;
  });
  const startPoint = document.querySelector('#start-point');
  if (startPoint) startPoint.value = settlementState.startPoint;
}

function saveSettlementSetup(initial, startPoint) {
  settlementState.initial = initial;
  settlementState.startPoint = startPoint;
  settlementState.players = playersFromInitial(initial, startPoint);
  settlementState.history = [];
  settlementState.setupComplete = true;
  settlementState.winner = 'A';
  settlementState.ronFrom = 'B';
  settlementState.dealer = 'B';
  saveSettlement();
  syncMatchSetupFields();
  renderSettlement();
}

function wizardSteps(includeSetup) {
  return [
    ...(includeSetup ? ['setup'] : []),
    'winner',
    ...(state.winType === 'ron' ? ['ronFrom'] : []),
    ...(state.seat === 'dealer' ? [] : ['dealer']),
    'confirm',
  ];
}

function ensureWizardSelection() {
  if (!['A', 'B', 'C'].includes(settlementState.winner)) settlementState.winner = 'A';
  if (state.seat === 'dealer') settlementState.dealer = settlementState.winner;
  else if (!['A', 'B', 'C'].includes(settlementState.dealer)) settlementState.dealer = 'B';
  if (settlementState.ronFrom === settlementState.winner || !['A', 'B', 'C'].includes(settlementState.ronFrom)) {
    settlementState.ronFrom = ['A', 'B', 'C'].find((id) => id !== settlementState.winner);
  }
}

function wizardChoiceMarkup(ids, selected) {
  return ids.map((id) => `<button class="wizard-choice ${id === selected ? 'is-selected' : ''}" data-player="${id}" type="button"><span><b>${id}</b> ${playerName(id)}</span><b>${id === selected ? '✓' : ''}</b></button>`).join('');
}

function renderWizard() {
  ensureWizardSelection();
  const step = wizardState.steps[wizardState.index];
  const total = wizardState.steps.length;
  document.querySelectorAll('.wizard-step').forEach((section) => section.classList.add('is-hidden'));
  document.querySelector(`#wizard-${step}-step`).classList.remove('is-hidden');
  document.querySelector('#wizard-title').textContent = wizardStepTitles[step];
  document.querySelector('#wizard-progress-label').textContent = `STEP ${wizardState.index + 1} / ${total}`;
  document.querySelector('#wizard-progress-bar').style.width = `${((wizardState.index + 1) / total) * 100}%`;
  document.querySelector('#wizard-back').disabled = wizardState.index === 0;
  document.querySelector('#wizard-next').classList.toggle('is-hidden', step === 'confirm');
  document.querySelector('#wizard-apply').classList.toggle('is-hidden', step !== 'confirm');
  document.querySelector('#wizard-next').textContent = step === 'setup' ? '保存して次へ' : '次へ';

  const wizardNameInputs = { A: '#wizard-a-name', B: '#wizard-b-name', C: '#wizard-c-name' };
  ['A', 'B', 'C'].forEach((id) => {
    const input = document.querySelector(wizardNameInputs[id]);
    if (input && !input.value) input.value = settlementState.initial[id].name;
  });
  const wizardStartPoint = document.querySelector('#wizard-start-point');
  if (wizardStartPoint && !wizardStartPoint.value) wizardStartPoint.value = settlementState.startPoint || 35000;

  document.querySelector('#wizard-winner-options').innerHTML = wizardChoiceMarkup(['A', 'B', 'C'], settlementState.winner);
  document.querySelector('#wizard-ron-options').innerHTML = wizardChoiceMarkup(['A', 'B', 'C'].filter((id) => id !== settlementState.winner), settlementState.ronFrom);
  document.querySelector('#wizard-dealer-options').innerHTML = wizardChoiceMarkup(['A', 'B', 'C'], settlementState.dealer);

  const result = calculateHand({ seat: settlementState.dealer === settlementState.winner ? 'dealer' : 'nonDealer' });
  document.querySelector('#wizard-result-score').textContent = `${yen(result.total)}点`;
  const summary = [
    ['あがり者', playerName(settlementState.winner)],
    ['あがり方', state.winType === 'ron' ? 'ロン' : 'ツモ'],
    ...(state.winType === 'ron' ? [['ロンされた人', playerName(settlementState.ronFrom)]] : []),
    ['親', playerName(settlementState.dealer)],
  ];
  document.querySelector('#wizard-summary').innerHTML = summary.map(([label, value]) => `<dt>${label}</dt><dd>${value}</dd>`).join('');
}

function openSettlementWizard(startStep = settlementState.setupComplete ? 'winner' : 'setup', returnMode = 'hand') {
  wizardState.returnMode = returnMode;
  const includeSetup = startStep === 'setup' || !settlementState.setupComplete;
  wizardState.steps = wizardSteps(includeSetup);
  wizardState.index = Math.max(0, wizardState.steps.indexOf(startStep));
  if (includeSetup) {
    ['A', 'B', 'C'].forEach((id) => {
      const key = id.toLowerCase();
      const source = document.querySelector(`#player-${key}-name`);
      document.querySelector(`#wizard-${key}-name`).value = source?.value || settlementState.initial[id].name;
    });
    document.querySelector('#wizard-start-point').value = document.querySelector('#start-point')?.value || settlementState.startPoint || 35000;
  }
  renderWizard();
  document.querySelector('#settlement-wizard').classList.remove('is-hidden');
  document.body.classList.add('wizard-open');
}

function closeSettlementWizard(returnMode = wizardState.returnMode) {
  document.querySelector('#settlement-wizard').classList.add('is-hidden');
  document.body.classList.remove('wizard-open');
  if (returnMode === false) return;
  const targetTab = document.querySelector(`.mode-tab[data-mode="${returnMode}"]`);
  const targetPanel = document.querySelector(`#${returnMode}-panel`);
  if (targetTab && targetPanel) {
    targetTab.click();
    targetPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function saveWizardSetup() {
  const initial = {};
  ['A', 'B', 'C'].forEach((id) => {
    const name = document.querySelector(`#wizard-${id.toLowerCase()}-name`).value.trim() || `プレイヤー ${id}`;
    initial[id] = { name };
  });
  const startPoint = Math.max(0, Number(document.querySelector('#wizard-start-point').value) || 35000);
  saveSettlementSetup(initial, startPoint);
  showSettlementFeedback('初期設定を保存し、対局を開始しました。');
}

function advanceWizard() {
  const step = wizardState.steps[wizardState.index];
  if (step === 'setup') saveWizardSetup();
  if (wizardState.index < wizardState.steps.length - 1) {
    wizardState.index += 1;
    saveSettlement();
    renderWizard();
  }
}

function retreatWizard() {
  if (wizardState.index > 0) {
    wizardState.index -= 1;
    renderWizard();
  }
}

function resetHandState() {
  Object.assign(state, { winType: 'ron', seat: 'nonDealer', handStatus: 'closed', waitFu: 0, pairFu: 0, meldCount: 0, kanCount: 0, melds: [], yakuhaiCount: 0, bonusHan: 0, honba: 0, riichiStick: false });
  state.selectedYakus = new Set();
  state.yakuman = false;
  document.querySelectorAll('[data-choice-group]').forEach((group) => group.querySelectorAll('.choice').forEach((item, index) => item.classList.toggle('is-selected', group.dataset.choiceGroup !== 'waitFu' && index === 0)));
  document.querySelector('#pair-fu').value = '0';
  document.querySelector('#riichi-stick-toggle').checked = false;
  document.querySelectorAll('[data-step]').forEach((button) => {
    const value = document.querySelector(`#${button.dataset.step}-value`);
    if (value) value.textContent = '0';
  });
}

function resetAll() {
  resetHandState();
  renderHand();
}

function applyInitialSettings() {
  const startPoint = Math.max(0, Number(document.querySelector('#start-point').value) || 35000);
  const nextInitial = {};
  ['A', 'B', 'C'].forEach((id) => {
    const name = document.querySelector(`#player-${id.toLowerCase()}-name`).value.trim() || `プレイヤー ${id}`;
    nextInitial[id] = { name };
  });
  saveSettlementSetup(nextInitial, startPoint);
  settlementState.oka = Math.max(0, Number(document.querySelector('#oka-input').value) || 35000);
  settlementState.uma = Number(document.querySelector('#uma-input').value) || 45;
  saveSettlement();
  showSettlementFeedback('初期設定を保存し、対局を開始しました。');
}

function restartMatch() {
  settlementState.players = playersFromInitial(settlementState.initial, settlementState.startPoint);
  settlementState.history = [];
  saveSettlement();
  renderSettlement();
  showSettlementFeedback('初期設定の点数に戻しました。');
}

function showSettlementFeedback(message, isError = false) {
  const feedback = document.querySelector('#settlement-feedback');
  feedback.textContent = message;
  feedback.classList.toggle('is-error', isError);
}

function transferForCurrentHand(result) {
  const winner = settlementState.winner;
  const dealer = settlementState.dealer;
  const delta = { A: 0, B: 0, C: 0 };
  if (state.winType === 'ron') {
    const payer = settlementState.ronFrom;
    const payment = (result.payments[0]?.value || result.total) + (state.riichiStick ? 1000 : 0);
    delta[winner] += payment;
    delta[payer] -= payment;
    return { delta, payer };
  }
  const otherPlayers = ['A', 'B', 'C'].filter((id) => id !== winner);
  if (dealer === winner) {
    const each = result.payments[0]?.value || 0;
    otherPlayers.forEach((id) => { delta[id] -= each; });
  } else {
    const dealerPayer = dealer;
    const childPayer = otherPlayers.find((id) => id !== dealerPayer);
    const dealerPayment = result.payments[0]?.value || 0;
    const childPayment = result.payments[1]?.value || 0;
    delta[dealerPayer] -= dealerPayment;
    delta[childPayer] -= childPayment;
  }
  delta[winner] += result.total - (state.riichiStick ? 1000 : 0);
  return { delta, payer: null };
}

let lastAppliedHandAt = 0;
function applyHandResult() {
  const now = Date.now();
  if (now - lastAppliedHandAt < 300) return;
  lastAppliedHandAt = now;
  const result = calculateHand({ seat: settlementState.dealer === settlementState.winner ? 'dealer' : 'nonDealer' });
  const dealerContinues = settlementState.dealer === settlementState.winner;
  const nextHonba = dealerContinues ? Math.min(99, state.honba + 1) : 0;
  const { delta, payer } = transferForCurrentHand(result);
  const before = scoreSnapshot();
  ['A', 'B', 'C'].forEach((id) => { settlementState.players[id].score += delta[id]; });
  const after = scoreSnapshot();
  settlementState.history.push({ id: `${Date.now()}-${settlementState.history.length}`, winner: settlementState.winner, payer, dealer: settlementState.dealer, winType: state.winType, amount: result.total, detail: result.detail, delta, before, after });
  saveSettlement();
  renderSettlement();
  resetHandState();
  state.seat = dealerContinues ? 'dealer' : 'nonDealer';
  state.honba = nextHonba;
  renderHand();
  showSettlementFeedback(`${playerName(settlementState.winner)}のあがりを反映しました。`);
}

function cancelHistory(id) {
  const index = settlementState.history.findIndex((entry) => entry.id === id);
  if (index < 0) return;
  settlementState.history.splice(index, 1);
  settlementState.players = playersFromInitial(settlementState.initial, settlementState.startPoint);
  settlementState.history.forEach((entry) => {
    ['A', 'B', 'C'].forEach((player) => { settlementState.players[player].score += entry.delta[player]; });
  });
  saveSettlement();
  renderSettlement();
  showSettlementFeedback('履歴を取り消し、以降の点数を再計算しました。');
}

document.querySelector('#global-reset').addEventListener('click', resetAll);
document.querySelector('#open-settlement').addEventListener('click', () => {
  const tab = document.querySelector('.mode-tab[data-mode="match"]');
  tab.click();
  if (settlementState.setupComplete) openSettlementWizard('winner');
});
document.querySelector('#save-initial-settings').addEventListener('click', () => openSettlementWizard('setup'));
document.querySelector('#restart-match').addEventListener('click', () => openSettlementWizard('setup'));
document.querySelector('#match-settings').addEventListener('click', () => openSettlementWizard('setup', 'match'));
document.querySelector('#apply-hand-result').addEventListener('click', applyHandResult);
document.querySelector('#winner-select').addEventListener('change', (event) => {
  settlementState.winner = event.target.value;
  if (settlementState.ronFrom === settlementState.winner) settlementState.ronFrom = ['A', 'B', 'C'].find((id) => id !== settlementState.winner);
  state.seat = settlementState.dealer === settlementState.winner ? 'dealer' : 'nonDealer';
  renderHand();
  renderSettlement();
});
document.querySelector('#ron-from-select').addEventListener('change', (event) => { settlementState.ronFrom = event.target.value; saveSettlement(); renderSettlementSelectors(); });
document.querySelector('#settlement-dealer-select').addEventListener('change', (event) => {
  settlementState.dealer = event.target.value;
  state.seat = settlementState.dealer === settlementState.winner ? 'dealer' : 'nonDealer';
  saveSettlement();
  renderHand();
  renderSettlement();
});
document.querySelector('#history-list').addEventListener('click', (event) => {
  const button = event.target.closest('[data-history-id]');
  if (button) cancelHistory(button.dataset.historyId);
});
document.querySelector('#uma-input').addEventListener('change', () => {
  settlementState.uma = Number(document.querySelector('#uma-input').value) || 45;
  saveSettlement();
  renderSettlement();
});
document.querySelector('#oka-input').addEventListener('change', () => {
  settlementState.oka = Number(document.querySelector('#oka-input').value) || 35000;
  saveSettlement();
  renderSettlement();
});

document.querySelector('#wizard-winner-options').addEventListener('click', (event) => {
  const button = event.target.closest('[data-player]');
  if (!button) return;
  settlementState.winner = button.dataset.player;
  ensureWizardSelection();
  saveSettlement();
  renderWizard();
});
document.querySelector('#wizard-ron-options').addEventListener('click', (event) => {
  const button = event.target.closest('[data-player]');
  if (!button) return;
  settlementState.ronFrom = button.dataset.player;
  saveSettlement();
  renderWizard();
});
document.querySelector('#wizard-dealer-options').addEventListener('click', (event) => {
  const button = event.target.closest('[data-player]');
  if (!button) return;
  settlementState.dealer = button.dataset.player;
  state.seat = settlementState.dealer === settlementState.winner ? 'dealer' : 'nonDealer';
  saveSettlement();
  renderHand();
  renderWizard();
});
document.querySelector('#wizard-next').addEventListener('click', advanceWizard);
document.querySelector('#wizard-back').addEventListener('click', retreatWizard);
document.querySelector('#wizard-close').addEventListener('click', () => closeSettlementWizard());
document.querySelector('#wizard-cancel').addEventListener('click', () => closeSettlementWizard());
document.querySelector('#wizard-apply').addEventListener('click', () => {
  applyHandResult();
  closeSettlementWizard(false);
  const matchTab = document.querySelector('.mode-tab[data-mode="match"]');
  matchTab.click();
  document.querySelector('#match-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
});

['A', 'B', 'C'].forEach((id) => {
  const key = id.toLowerCase();
  document.querySelector(`#player-${key}-name`).value = settlementState.initial[id].name;
});
document.querySelector('#start-point').value = settlementState.startPoint;
document.querySelector('#oka-input').value = settlementState.oka;
document.querySelector('#uma-input').value = String(settlementState.uma);
renderHand();
renderSettlement();
