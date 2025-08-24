(function () {
  'use strict';

// Auto-generated from Excel. Do not edit manually.
const FLOW_DATA = {
  flows: {
    'main': [
      { status: '申込', status: '申込', role: '案件管理', past: ['戻る'], future: ['発注情報入力', '申込→発注情報入力'] },
      { status: '発注情報入力', role: 'OP', past: ['申込へ戻る', '戻る'], future: ['発注内容確認', '入力→確認'] },
      { status: '発注内容確認（長いテスト）', role: 'SV', past: ['入力へ戻る', '戻る'], future: ['発注', '確認→発注'] },
      { status: '発注', role: '役職者', past: ['確認へ戻る', '戻る'], future: ['発注後', '発注→発注後'] },
      { status: '発注後', role: '', past: ['発注へ戻る', '戻る'], future: [] },
    ],
    'side': [
      { status: '脇道', role: '', past: ['戻る'], future: [] },
      { status: '完了', role: '', past: ['戻る'], future: [] },
    ],
  },
};

// 現在のステータスから、main 以外を優先してフロー判定 → 無ければ main
function getFlowByStatus(status){
  if (!status) return 'main';
  const keys = Object.keys(FLOW_DATA.flows);
  // 1st pass: non-main
  for (const k of keys){
    if (k === 'main') continue;
    const arr = FLOW_DATA.flows[k] || [];
    if (arr.some(x => x.status === status)) return k;
  }
  // fallback
  return 'main';
}

function getStepEntry(flow, status){
  const arr = FLOW_DATA.flows[flow] || [];
  return arr.find(x => x.status === status) || null;
}

function selectStepList(record){
  const status = record?.ステータス?.value;
  const flow = getFlowByStatus(status);
  return (FLOW_DATA.flows[flow] || []).map(x => x.status);
}

function selectDept(record, step){
  const status = record?.ステータス?.value;
  const flow = getFlowByStatus(status);
  const entry = getStepEntry(flow, step);
  return entry?.role || null;
}

// current→next の向きで past/future を返す（配列1件なら文字列で返す互換仕様）
function selectAction(current, next){
  if (!current || !next) return null;
  const flow = getFlowByStatus(current);
  const arr = FLOW_DATA.flows[flow] || [];
  const curIdx = arr.findIndex(x => x.status === current);
  const nextIdx = arr.findIndex(x => x.status === next);
  if (curIdx === -1 || nextIdx === -1) return null;

  const dir = Math.sign(nextIdx - curIdx); // +: future, -: past
  const entry = arr[curIdx];
  const labels = dir > 0 ? (entry.future || []) : dir < 0 ? (entry.past || []) : [];
  if (!labels || labels.length === 0) return null;
  return labels.length === 1 ? labels[0] : labels;
}


  // ===== 移行フラグ / バナー文言 =====
  let FEATURE_HIDE_FLOW_ACTIONS       = false; // trueで「進む/戻る」ボタンを非表示
  const FEATURE_SHOW_MIGRATION_BANNER = true;  // trueでバナーを表示
  const BANNER_LOCAL_STORAGE_KEY      = 'arrow-steps-banner-v1';
  const BANNER_TEXT = '【お知らせ】↓のフロー図から直接「進む」「戻る」を実行できるよう操作方法を改善しました。';
    //const BANNER_TEXT = '【お知らせ】↓のフロー図から直接「進む」「戻る」を実行できるよう改善しました。ボタンの押し間違い防止のため、↑のボタンは将来的に廃止する予定です。';

  const STYLE_ID     = 'arrow-steps-style';
  const CONTAINER_ID = 'arrow-steps-container';
  const BANNER_ID    = 'arrow-migration-banner';
  const MAX_VISIBLE_STEPS = 4;

  [
    'arrow-steps-green-theme','arrow-steps-pad-override','arrow-steps-badge-y-override',
    'arrow-steps-badge-left-override','arrow-steps-badge-center-override','arrow-steps-badge-shadow-override',
    'arrow-steps-badge-color-override','arrow-steps-badge-border-white','arrow-steps-badge-bold-and-up',
    'arrow-steps-future1-text-white','arrow-steps-future1-text-default','arrow-steps-current-arrow-white',
    'arrow-steps-remove-shadows','arrow-steps-restore-shadows','arrow-steps-current-glow',
    'arrow-steps-center-badge-fix','arrow-steps-badge-y-offset','arrow-steps-badge-center-lock','arrow-steps-no-blur',
    'arrow-hint-style'
  ].forEach(id => document.getElementById(id)?.remove());

  const DEPT_COLORS = {
    'OP':      { bg: '#1976D2', fg: '#FFFFFF' },
    'SV':      { bg: '#D32F2F', fg: '#FFFFFF' },
    '役職者':   { bg: '#000000', fg: '#FFFFFF' },
    '案件管理': { bg: '#00897B', fg: '#FFFFFF' },
    '文書管理': { bg: '#000000', fg: '#FFFFFF' }
  };

  // アニメ方向判定用
  let prevKey = null;
  let prevCurrentIndex = null;

  // 二重実行防止
  let busy = false;

  // 非表示化したネイティブボタンのキャッシュ（ラベル正規化 → 要素）
  const HIDDEN_DIRECT_ACTIONS = new Map();

  // --------- utils ----------
  const normalize = s => (s || '').replace(/\s+/g, '').trim();
  const visible = el => el && el.offsetParent !== null;
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  async function waitFor(fnOrSel, timeout = 2000, step = 50) {
    const isFn = typeof fnOrSel === 'function';
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const el = isFn ? fnOrSel() : document.querySelector(fnOrSel);
      if (el) return el;
      await sleep(step);
    }
    return null;
  }
  const toLabelArray = v => Array.isArray(v) ? v : (v ? [v] : []);

  function injectStyle() {
    document.getElementById(STYLE_ID)?.remove();
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      :root{
        --arrow-gap: -6px;
        --arrow-minw: 110px;
        --arrow-h: 26px;
        --arrow-notch: 12px;
        --arrow-font: 12px;
        --arrow-pad-v: 4px;
        --arrow-pad-h: 28px;
        --arrow-current-h: 32px;
        --arrow-current-font: 14px;
        --badge-shift-normal: -22px;
        --badge-shift-current: -22px;
        --badge-maxw: 240px;
      }

      #${CONTAINER_ID}{
        display:flex;
        margin:0 0 12px 0;
        font-family: system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,"Noto Sans JP",sans-serif;
        overflow: visible;
        align-items:center;
        position:relative;
        z-index:0;
      }

      /* お知らせバナー */
      #${BANNER_ID}{
        display:flex; align-items:flex-start; gap:8px;
        margin:0 12px 8px 12px; padding:8px 12px;
        background:#E3F2FD; color:#0D47A1; border:1px solid rgba(13,71,161,.2);
        border-radius:10px; font-size:12px; line-height:1.6;
        box-shadow:0 1px 2px rgba(0,0,0,.04); position:relative;
      }
      #${BANNER_ID} .banner-icon{ font-weight:700; margin-right:2px; }
      #${BANNER_ID} .banner-close{
        position:absolute; right:8px; top:6px; border:none; background:none; cursor:pointer;
        font-size:14px; line-height:1; color:inherit; opacity:.7;
      }
      #${BANNER_ID} .banner-close:hover{ opacity:1; }

      .arrow-wrap{
        position:relative;
        display: grid;
        margin-left: var(--arrow-gap);
        min-width: var(--arrow-minw);
        flex: 0 0 auto;
      }
      .arrow-wrap:first-child{ margin-left: 12px; }

      .arrow-step{
        grid-area: 1 / 1;
        position:relative;
        height: var(--arrow-h);
        padding: var(--arrow-pad-v) var(--arrow-pad-h);
        font-size: var(--arrow-font);
        font-weight:700;
        display:flex; align-items:center; justify-content:center;
        clip-path: polygon(
          0 0, calc(100% - var(--arrow-notch)) 0, 100% 50%,
          calc(100% - var(--arrow-notch)) 100%, 0 100%, var(--arrow-notch) 50%
        );
        background:#e0e0e0;
        color:#555;
        white-space:nowrap; text-overflow:ellipsis; overflow:hidden;
        z-index:1;
        user-select:none;
      }
      .arrow-step::before{ content:""; position:absolute; inset:0; clip-path:inherit; border:1px solid rgba(0,0,0,.05); pointer-events:none; }
      .arrow-label{ max-width:240px; overflow:hidden; text-overflow:ellipsis; }

      /* 状態色 */
      .arrow-wrap.past    .arrow-step{ background:#E0E0E0; color:#555; }
      .arrow-wrap.future1 .arrow-step{ background:#81C784; color:#000000; }
      .arrow-wrap.future2 .arrow-step{ background:#C8E6C9; color:#2E7D32; }
      .arrow-wrap.current .arrow-step{
        background:#43A047; color:#FFFFFF;
        height:var(--arrow-current-h); font-size:var(--arrow-current-font);
        clip-path: polygon(0 0, calc(100% - 15px) 0, 100% 50%, calc(100% - 15px) 100%, 0 100%, 15px 50%);
        box-shadow: 0 1px 0 rgba(0,0,0,.04), 0 4px 12px rgba(0,0,0,.12);
      }

      /* クリック可/不可 */
      .arrow-wrap.clickable .arrow-step{ cursor:pointer; }
      .arrow-wrap.clickable .arrow-step:hover{ filter: brightness(1.03); }
      .arrow-wrap.clickable .arrow-step:active{ transform: translateY(1px); }
      .arrow-wrap.disabled  .arrow-step{ cursor:not-allowed; opacity:1; }

      /* current の白文字グロー */
      #${CONTAINER_ID} .arrow-wrap.current .arrow-label{
        text-shadow:
          0 0 1px  rgba(255,255,255,.60),
          0 0 4px  rgba(255,255,255,.35),
          0 0 8px  rgba(255,255,255,.22),
          0 0 14px rgba(255,255,255,.15);
      }

      /* 役職バッジ */
      .role-badge{
        grid-area: 1 / 1;
        position: relative !important;
        inset: auto !important;
        margin: 0 !important;
        justify-self: center !important;
        align-self: center !important;
        transform: translate3d(0, var(--badge-shift-normal), 0) !important;

        display:inline-flex; align-items:center; justify-content:center;
        padding:3px 10px; border-radius:999px;
        border: 2px solid #ffffff;
        font-size:11px; line-height:1.2; font-weight:700;
        color:#333; background:#f5f5f5;
        z-index:5; pointer-events:none;
        white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
        max-width: var(--badge-maxw);
        box-shadow: 0 6px 14px rgba(0,0,0,.18), 0 2px 4px rgba(0,0,0,.12);
      }
      .arrow-wrap.current .role-badge{ transform: translate3d(0, var(--badge-shift-current), 0) !important; }

      /* === アニメーション === */
      .arrow-wrap.animating{ will-change: opacity, transform; }
      @keyframes enter-from-right{ from{ transform: translateX(20px); opacity: 0; } to{ transform: translateX(0); opacity: 1; } }
      @keyframes enter-from-left { from{ transform: translateX(-20px); opacity: 0; } to{ transform: translateX(0); opacity: 1; } }
      @keyframes fade-in         { from{ opacity: 0; transform: translateY(2px); } to{ opacity: 1; transform: translateY(0); } }
      .anim-enter-right{ animation: enter-from-right 240ms cubic-bezier(.2,.8,.2,1) both; animation-delay: var(--stagger, 0ms); }
      .anim-enter-left { animation: enter-from-left  240ms cubic-bezier(.2,.8,.2,1) both; animation-delay: var(--stagger, 0ms); }
      .anim-fade-in    { animation: fade-in          200ms ease-out both;               animation-delay: var(--stagger, 0ms); }
    `;
    document.head.appendChild(style);
  }

  // --------- UI探索系（direct / menu） ---------
  function findDirectActionElementByLabel(label) {
    const name = normalize(label);
    const roots = [
      document.querySelector('.gaia-app-statusbar'),
      document.querySelector('.gaia-argoui-app-statusbar'),
      document.querySelector('[data-gaia-automation-id="record-statusbar"]'),
      document.querySelector('.ocean-ui-header-toolbar'),
      document.body
    ].filter(Boolean);

    for (const root of roots) {
      const btn = [...root.querySelectorAll('button, a, [role="button"]')]
        .find(e => visible(e) && normalize(e.textContent) === name);
      if (btn) return btn;

      const labelEl = [...root.querySelectorAll('.gaia-app-statusbar-action-label')]
        .find(l => {
          const txt = normalize(l.textContent || l.getAttribute('title') || '');
          return visible(l) && txt === name;
        });
      if (labelEl) return labelEl.closest('.gaia-app-statusbar-action') || labelEl;
    }
    return null;
  }

  function findMenuItemByLabel(label) {
    const name = normalize(label);
    const menus = [...document.querySelectorAll('.gaia-argoui-menu,[role="menu"],.gaia-app-statusbar-menu')].filter(visible);
    for (const m of menus) {
      const item = [...m.querySelectorAll('li, a, button, [role="menuitem"]')]
        .find(e => normalize(e.textContent) === name);
      if (item) return item;
    }
    return null;
  }

  async function openActionMenuNearStatusbar() {
    const statusBar =
      document.querySelector('.gaia-app-statusbar') ||
      document.querySelector('.gaia-argoui-app-statusbar') ||
      document.querySelector('[data-gaia-automation-id="record-statusbar"]') ||
      document.querySelector('.ocean-ui-header-toolbar') ||
      document.body;

    const cand = [
      'button[aria-haspopup="true"]',
      '.gaia-argoui-app-toolbar-menubutton button',
      '.gaia-app-statusbar-menubutton button',
      'button'
    ];
    const btn = cand.map(sel => statusBar.querySelector(sel)).find(Boolean);
    if (!btn) return false;
    btn.click();
    const menu = await waitFor(() =>
      [...document.querySelectorAll('.gaia-argoui-menu,[role="menu"],.gaia-app-statusbar-menu')].find(visible), 1200);
    return !!menu;
  }

  function closeAnyOpenMenus() {
    const has = [...document.querySelectorAll('.gaia-argoui-menu,[role="menu"],.gaia-app-statusbar-menu')].some(visible);
    if (!has) return;
    document.dispatchEvent(new KeyboardEvent('keydown', { key:'Escape', code:'Escape', bubbles:true }));
    setTimeout(() => { document.body.click(); }, 10);
  }

  // ---- 事前可用性チェック（見つかった時のみ clickable にする） ----
  async function checkActionAvailability(labels) {
    for (const label of labels) {
      if (HIDDEN_DIRECT_ACTIONS.has(normalize(label))) return true;
    }
    for (const label of labels) {
      if (findDirectActionElementByLabel(label)) return true;
    }
    const opened = await openActionMenuNearStatusbar();
    if (opened) {
      let exists = false;
      for (const label of labels) {
        if (findMenuItemByLabel(label)) { exists = true; break; }
      }
      closeAnyOpenMenus();
      return exists;
    }
    return false;
  }

  // ---- ネイティブの「進む/戻る」ボタンを上から消す（寄り道だけ残す） ----
  function hideNativeFlowActions(currentStatus, stepList, currentIndex) {
    if (!FEATURE_HIDE_FLOW_ACTIONS) return; // ← 当面はオフ

    const toHide = new Set();
    const nextStep = stepList[currentIndex + 1];
    const prevStep = stepList[currentIndex - 1];
    toLabelArray(nextStep ? selectAction(currentStatus, nextStep) : null).forEach(l => l && toHide.add(normalize(l)));
    toLabelArray(prevStep ? selectAction(currentStatus, prevStep) : null).forEach(l => l && toHide.add(normalize(l)));

    for (const label of toHide) {
      if (HIDDEN_DIRECT_ACTIONS.has(label)) continue;
      const el = findDirectActionElementByLabel(label);
      if (el) {
        const host = el.closest('.gaia-app-statusbar-action') || el;
        host.setAttribute('data-hidden-by-arrows', '1');
        host.style.display = 'none';
        HIDDEN_DIRECT_ACTIONS.set(label, host);
      }
    }

    // DOMから消えた古い参照を掃除
    for (const [key, el] of HIDDEN_DIRECT_ACTIONS) {
      if (!document.body.contains(el)) HIDDEN_DIRECT_ACTIONS.delete(key);
    }
  }

  // ---- 実行（process.proceed発火） ----
  async function proceedViaUI(labels) {
    // 非表示キャッシュを優先（将来オンにした時も動く）
    for (const raw of labels) {
      const key = normalize(raw);
      const hiddenEl = HIDDEN_DIRECT_ACTIONS.get(key);
      if (hiddenEl && document.body.contains(hiddenEl)) {
        const prev = hiddenEl.style.display;
        hiddenEl.style.display = '';
        hiddenEl.click();
        hiddenEl.style.display = prev;
        await autoConfirmIfNeeded();
        return true;
      }
    }
    for (const label of labels) {
      const direct = findDirectActionElementByLabel(label);
      if (direct) {
        direct.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
        direct.click();
        await autoConfirmIfNeeded();
        return true;
      }
    }
    const opened = await openActionMenuNearStatusbar();
    if (opened) {
      for (const label of labels) {
        const item = findMenuItemByLabel(label);
        if (item) {
          item.click();
          await autoConfirmIfNeeded();
          return true;
        }
      }
      closeAnyOpenMenus();
    }
    console.warn('UI上にアクションが見つかりません:', labels);
    return false;
  }

  // ---- 「実行/OK/はい」などの確認UIを自動承認 ----
  async function autoConfirmIfNeeded() {
    const popup = await waitFor(() =>
      [...document.querySelectorAll('.gaia-app-statusbar-assigneepopup')].find(el => {
        const s = getComputedStyle(el);
        return s.visibility !== 'hidden' && s.display !== 'none';
      }), 1500);
    if (popup) {
      const ok = popup.querySelector('.gaia-app-statusbar-assigneepopup-ok, button[name="ok"]');
      if (ok) { ok.click(); return; }
    }
    const dialog = await waitFor(() =>
      [...document.querySelectorAll('.gaia-argoui-dialog,[role="dialog"]')].find(visible), 1500);
    if (dialog) {
      const textarea = dialog.querySelector('textarea');
      if (textarea && !textarea.value) textarea.value = '';
      const okBtn = [...dialog.querySelectorAll('button')].find(b =>
        /実行|進む|OK|はい|確定|Apply|Proceed|Execute/i.test(b.textContent || ''));
      okBtn?.click();
    }
  }

  async function fetchLatestRecord() {
    const app = kintone.app.getId();
    const id  = kintone.app.record.getId();
    const res = await kintone.api(kintone.api.url('/k/v1/record.json', true), 'GET', { app, id });
    return res.record;
  }

  async function changeStatus(record, current, target) {
    if (busy) return;
    const labels = toLabelArray(selectAction(current, target));
    if (!labels.length) return;

    busy = true;
    try {
      const ok = await proceedViaUI(labels);
      if (ok) {
        await sleep(300);
        const latest = await fetchLatestRecord();
        render(latest);
      }
    } catch (e) {
      console.error('ステータス変更失敗:', e);
    } finally {
      busy = false;
    }
  }

  // ---- お知らせバナー表示（移行期間向け） ----
  function renderMigrationBanner(parentNode) {
    if (!FEATURE_SHOW_MIGRATION_BANNER) return;
    if (localStorage.getItem(BANNER_LOCAL_STORAGE_KEY) === '1') return;

    // 既存があれば消す
    document.getElementById(BANNER_ID)?.remove();

    const banner = document.createElement('div');
    banner.id = BANNER_ID;
    banner.innerHTML = `
      <span class="banner-icon">ℹ️</span>
      <span class="banner-text">${BANNER_TEXT}</span>
      <button class="banner-close" aria-label="閉じる" title="閉じる">×</button>
    `;
    banner.querySelector('.banner-close').addEventListener('click', () => {
      localStorage.setItem(BANNER_LOCAL_STORAGE_KEY, '1');
      banner.remove();
    });

    parentNode.insertBefore(banner, parentNode.firstChild);
  }

  function render(record) {
    injectStyle();

    const currentStatus = record?.ステータス?.value;
    if (!currentStatus) { console.warn('record.ステータス?.value が取得できませんでした。'); return; }

    const stepList = selectStepList(record) || [];
    if (!Array.isArray(stepList) || stepList.length === 0) { console.warn('selectStepList(record) が空配列です。'); return; }

    const currentIndex = stepList.indexOf(currentStatus);
    if (currentIndex === -1) { console.warn(`現在のステータス「${currentStatus}」が stepList に見つかりません。`); return; }

    const WINDOW_SIZE = MAX_VISIBLE_STEPS;
    const maxStart = Math.max(stepList.length - WINDOW_SIZE, 0);
    let start = Math.min(Math.max(currentIndex - 1, 0), maxStart);
    const end = Math.min(start + WINDOW_SIZE, stepList.length);

    // 方向判定
    const keyNow = stepList.join('|');
    let direction = 0;
    if (prevKey === keyNow && typeof prevCurrentIndex === 'number') {
      const diff = currentIndex - prevCurrentIndex;
      direction = diff > 0 ? 1 : diff < 0 ? -1 : 0;
    }

    const parent = document.querySelector('#record-gaia');
    if (!parent) { console.warn('#record-gaia が見つかりませんでした。'); return; }

    // お知らせバナー（移行期間）
    renderMigrationBanner(parent);

    // 当面は非表示しない（将来オンにする想定）
    hideNativeFlowActions(currentStatus, stepList, currentIndex);

    // 既存UIを消して再生成
    document.getElementById(CONTAINER_ID)?.remove();
    const container = document.createElement('div');
    container.id = CONTAINER_ID;

    for (let visualIdx = 0, idx = start; idx < end; idx++, visualIdx++) {
      const wrap = document.createElement('div');
      wrap.className = 'arrow-wrap';

      const rel = idx - currentIndex;
      if (rel < 0) wrap.classList.add('past');
      else if (rel === 0) wrap.classList.add('current');
      else if (rel === 1) wrap.classList.add('future1');
      else wrap.classList.add('future2');

      const arrow = document.createElement('div');
      arrow.className = 'arrow-step';
      const label = document.createElement('span');
      label.className = 'arrow-label';
      label.textContent = stepList[idx];
      label.title = stepList[idx];
      arrow.appendChild(label);

      // 役職バッジ
      const dept = selectDept(record, stepList[idx]);
      if (dept) {
        const badge = document.createElement('div');
        badge.className = 'role-badge';
        const palette = DEPT_COLORS[dept];
        if (palette){ badge.style.background = palette.bg; badge.style.color = palette.fg; }
        badge.style.borderColor = '#FFFFFF';
        const text = document.createElement('span');
        text.textContent = dept;
        text.title = `担当：${dept}`;
        badge.appendChild(text);
        wrap.appendChild(badge);
      }

      // 入場アニメ
      wrap.classList.add('animating');
      const total = end - start;
      const order = direction >= 0 ? visualIdx : (total - 1 - visualIdx);
      wrap.style.setProperty('--stagger', `${order * 40}ms`);
      if (direction > 0)      wrap.classList.add('anim-enter-right');
      else if (direction < 0) wrap.classList.add('anim-enter-left');
      else                    wrap.classList.add('anim-fade-in');

      wrap.addEventListener('animationend', () => {
        wrap.classList.remove('anim-enter-right','anim-enter-left','anim-fade-in','animating');
        wrap.style.removeProperty('--stagger');
        wrap.style.transform = 'none';
        arrow.style.transform = 'none';
        arrow.style.filter = 'none';
      }, { once: true });

      // 事前可用性チェック：見つかった時だけ clickable（非同期で更新）
      if (rel === -1 || rel === 1) {
        const targetStep = stepList[idx];
        const labels = toLabelArray(selectAction(currentStatus, targetStep));
        wrap.classList.add('disabled'); // 初期は不可
        arrow.title = labels.length ? 'チェック中…' : '遷移不可：アクション未設定';

        if (labels.length) {
          (async () => {
            const available = await checkActionAvailability(labels);
            if (available) {
              wrap.classList.remove('disabled');
              wrap.classList.add('clickable');
              // ★ past -> 「戻す」 / future -> 「進める」
              arrow.title = wrap.classList.contains('past') ? '戻す' : '進める';
              wrap.addEventListener('click', () => changeStatus(record, currentStatus, targetStep));
            } else {
              wrap.classList.add('disabled');
              wrap.classList.remove('clickable');
              arrow.title = '遷移不可：UIにアクションが見つかりません';
            }
          })();
        }
      }

      wrap.appendChild(arrow);
      container.appendChild(wrap);
    }

    // ★ フロー図は「バナーの直後」に挿入する（= バナーを上に表示）
    const bannerEl = document.getElementById(BANNER_ID);
    if (bannerEl && parent.contains(bannerEl)) {
      parent.insertBefore(container, bannerEl.nextSibling);
    } else {
      parent.insertBefore(container, parent.firstChild);
    }

    prevKey = keyNow;
    prevCurrentIndex = currentIndex;
  }

  kintone.events.on('app.record.detail.show', function (event) {
    try { render(event.record); } catch (e) { console.error(e); }
    return event;
  });

  // デバッグ：process.proceed フック
  kintone.events.on('app.record.detail.process.proceed', e => {
    console.log('[proceed] action:', e.action || e.nextStatus || '(unknown)', e);
  });

  // （任意）コンソールから即時切替したい場合：
  // ArrowSteps.setHideFlowActions(true/false) で切替→再描画します。
  window.ArrowSteps = {
    async setHideFlowActions(on){
      FEATURE_HIDE_FLOW_ACTIONS = !!on;
      const rec = await (async () => {
        try {
          const app = kintone.app.getId();
          const id  = kintone.app.record.getId();
          const res = await kintone.api(kintone.api.url('/k/v1/record.json', true), 'GET', { app, id });
          return res.record;
        } catch { return null; }
      })();
      if (rec) render(rec);
    }
  };
})();
