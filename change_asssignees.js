(function () {
  'use strict';

  const assigneeFieldsCodes = [
    { statusName: '承認', fieldsCodeList: ['承認者'] },
    { statusName: '担当', fieldsCodeList: ['担当者'] }
  ];

  // ===== utils =====
  const usersToCodes = (v) => Array.from(new Set((Array.isArray(v) ? v : []).map(u => u && u.code).filter(Boolean)));
  const sameSet = (a, b) => a.length === b.length && a.every(x => b.includes(x));
  const defForStatus = (status) => assigneeFieldsCodes.find(d => d.statusName === status);
  const makeKey = (appId, recordId) => `assignees:app=${appId}:id=${recordId}`;
  const stash = (k, data) => { try { sessionStorage.setItem(k, JSON.stringify(data)); } catch (_) {} };
  const popStash = (k) => { try { const raw = sessionStorage.getItem(k); if (raw == null) return null; sessionStorage.removeItem(k); return JSON.parse(raw); } catch (_) { return null; } };

  async function onEditSubmit(event) {
    if (!event.recordId || event.type === 'app.record.create.submit') return event;
    const appId = kintone.app.getId();
    const rec = event.record;

    const status = rec['ステータス']?.value || '';
    const def = defForStatus(status);
    if (!def) return event;

    const target = Array.from(new Set(def.fieldsCodeList
      .flatMap(fc => usersToCodes(rec[fc]?.value))));
    if (target.length === 0) return event;

    const current = usersToCodes(rec['作業者']?.value);
    if (sameSet(target, current)) return event;

    const key = makeKey(appId, event.recordId);
    stash(key, { appId, recordId: event.recordId, assignees: target });
    return event;
  }

  async function onEditSubmitSuccess(event) {
    const appId = kintone.app.getId();
    const recordId = event.recordId;
    const key = makeKey(appId, recordId);
    const payload = popStash(key);
    if (!payload) return;

    try {
      await kintone.api(
        kintone.api.url('/k/v1/record/assignees.json', true),
        'PUT',
        { app: payload.appId, id: payload.recordId, assignees: payload.assignees }
      );
    } catch (e) {
      console.error('[assignees] PUT failed', e);
    }
    return event;
  }

  kintone.events.on(['app.record.edit.submit', 'app.record.index.edit.submit'], onEditSubmit);
  kintone.events.on(['app.record.edit.submit.success', 'app.record.index.edit.submit.success'], onEditSubmitSuccess);

})();
