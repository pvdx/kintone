(function () {
  'use strict';

  // =====================
  // Styles (required & oneOf)
  // =====================
  const style = document.createElement('style');
  style.textContent = `
    .required-highlight {
      box-shadow: 0 0 0 2px red !important;
      border-radius: 4px;
    }
    .oneof-highlight {
      box-shadow: 0 0 0 2px orange !important;
      border-radius: 4px;
    }
  `;
  document.head.appendChild(style);

  // =====================
  // Utils
  // =====================
  function getTodayDateString() {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  function hasField(record, fieldCode) {
    return Object.prototype.hasOwnProperty.call(record, fieldCode);
  }

  function isEmptyField(value) {
    return Array.isArray(value) ? value.length === 0 : value === '' || value == null;
  }

  function hasNonEmptyValue(record, fieldCode) {
    return hasField(record, fieldCode) && !isEmptyField(record[fieldCode].value);
  }

  // =====================
  // Condition evaluation helpers
  // =====================
  function getRecordPrimitive(record, fieldCode) {
    if (!fieldCode || !hasField(record, fieldCode)) return undefined;
    const v = record[fieldCode].value;
    if (Array.isArray(v)) {
      return v.map(x => (typeof x === 'string' ? x : (x?.name ?? x?.code ?? '')));
    }
    return v;
  }

  function parseList(str) {
    return String(str ?? '').split(',').map(s => s.trim()).filter(Boolean);
  }

  function cmpDatesOrNumbers(a, b) {
    const na = Number(a), nb = Number(b);
    if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
    return String(a).localeCompare(String(b));
  }

  // isnull / notnull / isin / notisin 対応
  function evaluateCondition(record, fieldCode, mark, condVal) {
    if (!fieldCode) return true; // no condition
    const recVal = getRecordPrimitive(record, fieldCode);
    const op = (mark || '').toLowerCase();

    if (op === '' || op === 'any') return true;
    if (op === 'empty' || op === 'isnull') return isEmptyField(recVal);
    if (op === 'notempty' || op === 'notnull') return !isEmptyField(recVal);

    const leftArr = Array.isArray(recVal) ? recVal : [recVal];
    const rightArr = Array.isArray(condVal) ? condVal : parseList(condVal);
    const leftScalar = Array.isArray(recVal) ? null : recVal;
    const rightScalar = rightArr.length === 1 ? rightArr[0] : condVal;

    switch (op) {
      case '==':   return String(leftScalar) === String(rightScalar);
      case '!=':   return String(leftScalar) !== String(rightScalar);
      case '>':    return cmpDatesOrNumbers(leftScalar, rightScalar) > 0;
      case '<':    return cmpDatesOrNumbers(leftScalar, rightScalar) < 0;
      case '>=':   return cmpDatesOrNumbers(leftScalar, rightScalar) >= 0;
      case '<=':   return cmpDatesOrNumbers(leftScalar, rightScalar) <= 0;
      case 'in':   return leftArr.some(v => rightArr.includes(String(v)));
      case 'notin':return leftArr.every(v => !rightArr.includes(String(v)));
      case 'isin': return rightArr.some(v => leftArr.includes(String(v)));
      case 'notisin': return rightArr.every(v => !leftArr.includes(String(v)));
      case 'includes':
      case 'contains':
        return leftArr.some(v => String(v).includes(String(rightScalar)));
      default:     return true;
    }
  }

  // =====================
  // Definition matching (multiple)
  // =====================
function matchStatusDef(def, current, next, record) {
  if (!def) return false;

  const statusOk = def[STATUS] === (current ?? '');
  const nextOk   = (next == null) || def[NEXT_STATUS] === next;
  if (!statusOk || !nextOk) return false;

  const fieldCode = def[CONDITION_FIELD_CODE] ?? '';
  const mark      = (def[CONDITION_MARK] ?? '').toString();
  const condVal   = def[CONDITION_VALUE];

  // 条件列が未指定なら無条件でOK
  if (!fieldCode && !mark) return true;

  return evaluateCondition(record, fieldCode, mark, condVal);
}


  function findStatusDefs(record, current, next = null) {
    return statusData.filter(def => matchStatusDef(def, current, next, record));
  }

  function firstOrNull(arr) {
    return Array.isArray(arr) && arr.length > 0 ? arr[0] : null;
  }

  // =====================
  // Required fields helpers
  // =====================
  function getRequiredFields(def) {
    return def.slice(REQUIRED_FIELDS);
  }

  function requiredMissingFields(def, record) {
    const type = String(def[REQUIRED_FIELDS_TYPE] || 'ALL').toLowerCase();
    const req = getRequiredFields(def);
    if (type === 'oneof') {
      const anyFilled = req.some(f => hasNonEmptyValue(record, f));
      return anyFilled ? [] : req.slice();
    }
    return req.filter(f => !hasNonEmptyValue(record, f));
  }

  // =====================
  // Copy user names: 〇〇者 → 〇〇者名
  // =====================
  function copyUserNamesToFields(record) {
    Object.keys(record).forEach(fieldCode => {
      if (!fieldCode.endsWith('者')) return;
      const nameField = `${fieldCode}名`;
      if (!hasField(record, nameField)) return;
      const value = record[fieldCode].value;
      if (Array.isArray(value)) {
        record[nameField].value = value.length > 0 ? value.map(item => item.name).join(', ') : '';
      } else if (typeof value === 'string') {
        record[nameField].value = value;
      } else {
        record[nameField].value = '';
      }
    });
  }

  // =====================
  // Field ID map
  // =====================
  let ELEMENT_FIELD_ID = {};
  function buildFieldIdMap() {
    try {
      const FORM_DATA = cybozu.data.page['FORM_DATA'];
      const fieldList = FORM_DATA.schema.table.fieldList;
      ELEMENT_FIELD_ID = {};
      for (const fieldId of Object.keys(fieldList)) {
        const fieldCode = fieldList[fieldId].var;
        ELEMENT_FIELD_ID[fieldCode] = fieldId;
      }
    } catch (e) {}
  }

  // =====================
  // Highlight by all matches (ALL=red, oneOf=orange)
  // =====================
  function highlightRequiredByAllMatches(record) {
    const status = record.ステータス?.value ?? '';
    const matches = findStatusDefs(record, status) || [];

    // clear existing
    document.querySelectorAll('.required-highlight').forEach(el => el.classList.remove('required-highlight'));
    document.querySelectorAll('.oneof-highlight').forEach(el => el.classList.remove('oneof-highlight'));
    if (matches.length === 0) return;

    const allSet = new Set();
    const oneOfSet = new Set();

    for (const def of matches) {
      const type = String(def[REQUIRED_FIELDS_TYPE] || 'ALL').toLowerCase();
      const req = getRequiredFields(def);
      if (type === 'oneof') {
        req.forEach(f => oneOfSet.add(f));
      } else {
        req.forEach(f => allSet.add(f));
      }
    }

    // If both, prefer ALL (red)
    oneOfSet.forEach(f => { if (allSet.has(f)) oneOfSet.delete(f); });

    function addClassToField(fieldCode, cls) {
      const fieldId = ELEMENT_FIELD_ID[fieldCode];
      if (!fieldId) return;
      const container = document.querySelector(`.control-value-gaia.value-${fieldId}`) ||
                        kintone.app.record.getFieldElement(fieldCode);
      const ui = container?.querySelector('.gaia-argoui-select, .user-selector-gaia, .file-image-gaia, input, textarea, select') || container;
      if (ui) ui.classList.add(cls);
    }

    allSet.forEach(f => addClassToField(f, 'required-highlight'));
    oneOfSet.forEach(f => addClassToField(f, 'oneof-highlight'));
  }

  // =====================
  // Hint (first only) & Tab click
  // =====================
function displayHint(record) {
  const status = record.ステータス?.value ?? '';
  const defs = findStatusDefs(record, status); // ← 複数一致を配列で取得
  if (!Array.isArray(defs) || defs.length === 0) return;

  const def = defs[0]; // 表示は先頭のみ使用
  const space = kintone.app.record.getSpaceElement('hint_space');
  if (!space) return;

  space.innerHTML = `
    <div style="padding:8px;background:#f9f9f9;border-left:4px solid #3498db;margin-bottom:6px;">
      <strong>対応内容：</strong>${def[HINT]}
      <span style="white-space:nowrap;margin-left:8px;font-size:12px;opacity:.8;vertical-align:middle;">
        <span style="display:inline-block;width:10px;height:10px;background:red;margin-right:4px;border-radius:2px;vertical-align:middle;"></span>必須
        <span style="display:inline-block;width:10px;height:10px;background:orange;margin:0 4px 0 8px;border-radius:2px;vertical-align:middle;"></span>どれか1つ
      </span>
    </div>
  `;
}



  function clickTab(tagName) {
    const buttons = document.querySelectorAll('button');
    for (const btn of buttons) {
      if (btn.textContent.trim() === tagName) {
        btn.click();
        break;
      }
    }
  }

  // =====================
  // Sync (Master / Log)
  // =====================
  async function syncToMasterApp(record) {
    if (master_app_id === 0) return;
    const masterId = record[master_record_number]?.value;
    if (!masterId) return;
    const body = { app: master_app_id, id: masterId, record: {} };
    master_sync_fields.forEach(f => {
      if (hasField(record, f)) body.record[f] = { value: record[f].value };
    });
    await kintone.api(kintone.api.url('/k/v1/record', true), 'PUT', body).catch(console.error);
  }

  async function syncToLogApp(record, current, next) {
    const today = getTodayDateString();
    if (log_app_id === 0) {
      const completeField = `${current}_完了日`;
      const startField = `${next}_開始日`;
      if (hasField(record, completeField)) record[completeField].value = today;
      if (hasField(record, startField)) record[startField].value = today;
      return;
    }
    const logId = record[log_record_number]?.value;
    const payload = {
      app: log_app_id,
      record: {
        [`${current}_完了日`]: { value: today },
        [`${next}_開始日`]: { value: today }
      }
    };
    log_sync_fields.forEach(f => {
      if (hasField(record, f)) payload.record[f] = { value: record[f].value };
    });
    if (logId) {
      payload.id = logId;
      await kintone.api(kintone.api.url('/k/v1/record', true), 'PUT', payload).catch(console.error);
    } else {
      const resp = await kintone.api(kintone.api.url('/k/v1/record', true), 'POST', payload).catch(console.error);
      if (resp?.id && hasField(record, log_record_number)) record[log_record_number].value = resp.id;
    }
  }

  // =====================
  // Events
  // =====================
  kintone.events.on('app.record.detail.process.proceed', async function (event) {
    const record = event.record;
    const current = record.ステータス?.value;
    const next = event.nextStatus.value;

    const matches = findStatusDefs(record, current, next);
    if (matches.length > 0) {
      // 1) バリデーションは全行評価
      const errors = [];
      for (const def of matches) {
        const reqType = String(def[REQUIRED_FIELDS_TYPE] || 'ALL').toLowerCase();
        const req = getRequiredFields(def);
        if (reqType === 'oneof') {
          const ok = req.some(f => hasNonEmptyValue(record, f));
          if (!ok && req.length > 0) {
            errors.push(`以下のどれか1つを入力してください：\n- ${req.join('\n- ')}`);
          }
        } else {
          const missing = req.filter(f => !hasNonEmptyValue(record, f));
          if (missing.length > 0) {
            errors.push(`以下の入力が必要です：\n- ${missing.join('\n- ')}`);
          }
        }
      }
      if (errors.length > 0) {
        event.error = `ステータス「${next}」に進むには、次を満たしてください：\n\n${errors.join('\n\n')}`;
        return event;
      }

      // 2) 自動入力は先頭行のみ適用
      const primary = matches[0];
      const login = kintone.getLoginUser();
      const today = getTodayDateString();
      (primary[LOGIN_USER_FIELDS] ?? []).forEach(f => {
        if (hasField(record, f)) {
          record[f].value = [{ code: login.code, name: login.name }];
          const nameField = `${f}名`;
          if (hasField(record, nameField)) record[nameField].value = login.name;
        }
      });
      (primary[DAY_FIELDS] ?? []).forEach(f => {
        if (hasField(record, f)) record[f].value = today;
      });
    }

    const customError = await handleCustomProcess(record, current, next);
    if (customError) { event.error = customError; return event; }
    await syncToLogApp(record, current, next);
    return event;
  });

  kintone.events.on(['app.record.detail.show', 'app.record.create.show', 'app.record.edit.show'], async function (event) {
    const record = event.record;
    const customError = await handleCustomShow(record);
    if (customError) { event.error = customError; return event; }

    buildFieldIdMap();

    // highlight all matches on show
    highlightRequiredByAllMatches(record);

    // hint & tab by first match only
    displayHint(record);
    setTimeout(() => {
      const status = record.ステータス?.value;
      const def = firstOrNull(findStatusDefs(record, status));
      if (def && def[TAG_NAME]) clickTab(def[TAG_NAME]);
    }, 500);
    return event;
  });

  kintone.events.on(['app.record.create.submit', 'app.record.edit.submit', 'app.record.index.edit.submit'], async function (event) {
    const record = event.record;
    copyUserNamesToFields(record);
    const customError = await handleCustomSubmit(record);
    if (customError) { event.error = customError; return event; }
    return event;
  });

  kintone.events.on(['app.record.create.submit.success', 'app.record.edit.submit.success', 'app.record.index.edit.submit.success'], async function (event) {
    const recordId = event.recordId;
    const resp = await kintone.api(kintone.api.url('/k/v1/record', true), 'GET', {
      app: kintone.app.getId(),
      id: recordId
    });
    await syncToMasterApp(resp.record);
    return event;
  });

  // =====================
  // Settings & Constants
  // =====================
  const master_app_id = 10;
  const log_app_id = 9;
  const master_record_number = 'マスタ_レコード番号';
  const log_record_number = 'ログ_レコード番号';
  const master_sync_fields = ['モード', '説明', '承認者'];
  const log_sync_fields = ['説明'];

  const STATUS = 0;
  const NEXT_STATUS = 1;
  const CONDITION_FIELD_CODE = 2;
  const CONDITION_MARK = 3;
  const CONDITION_VALUE = 4;
  const LOGIN_USER_FIELDS = 5;
  const DAY_FIELDS = 6;
  const HINT = 7;
  const TAG_NAME = 8;
  const RESERVED_2 = 9;
  const RESERVED_3 = 10;
  const RESERVED_4 = 11;
  const RESERVED_5 = 12;
  const RESERVED_6 = 13;
  const REQUIRED_FIELDS_TYPE = 14; // 'ALL' | 'oneOf'
  const REQUIRED_FIELDS = 15;      // required fields start index

  // =====================
  // Example statusData (adjust as needed)
  // =====================
  const statusData = [
    // [status, next, cond_field, mark, cond_value, loginUserFields[], dayFields[], hint, tagName, r2,r3,r4,r5,r6, requiredType, ...requiredFields]
    ['', '未処理', '', '', '', [], [], '必要な情報を入力してください', '', '', '', '', '', '', 'ALL', 'モード', '説明'],

    // 条件あり: 受付窓口 が配列/文字列に対して isin / notisin / in など
    ['未処理', '承認', '受付窓口', 'isin', '窓口A,窓口B', [], ['承認日'], '顧客に連絡してください（対象窓口）', '', '', '', '', '', '', 'ALL', 'モード', '説明'],
    ['未処理', '承認', '受付窓口', 'notisin', '窓口A,窓口B', [], ['承認日'], '顧客に連絡してください（対象外）', '', '', '', '', '', '', 'ALL', 'モード'],
    // フォールバック（条件なし）
    ['未処理', '承認', '', '', '', [], ['承認日'], '顧客に連絡してください', '', '', '', '', '', '', 'ALL', 'モード'],

    // oneOf の例：ファイル or 説明 のどちらか
    ['承認', '完了', '', '', '', ['承認者'], ['完了日'], '対応内容を記録し、完了日を入力してください', '', '', '', '', '', '', 'oneOf', 'ファイル', '説明'],

    ['完了', '', '', '', '', [], [], '完了済みです。確認のみ可能です', '', '', '', '', '', '', 'ALL']
  ];

  // =====================
  // Custom hooks (optional)
  // =====================
  async function handleCustomProcess(record, current, next) {
    return null;
  }

  async function handleCustomShow(record) {
    return null;
  }

  async function handleCustomSubmit(record) {
    return null;
  }

})();
