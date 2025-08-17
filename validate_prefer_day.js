(function () {
  'use strict';

  // ====== 設定：フィールドごとの許可曜日 ======
  // 例）水曜のみ: [3]、火・木: [2,4]
  const FIELD_RULES = {
    '希望日': [1, 2, 3, 4, 5], // 月のみ
    '日付2': [2], // 火のみ
    '日付3': [3], // 水のみ
    '日付4': [4], // 木のみ
    '日付5': [5], // 金のみ
    '日付6': [6], // 土のみ
    '日付7': [0], // 日のみ
    '日付8': [1,3] // 月・水のように複数指定も可能
  };

  // 必須扱いにしたいフィールド（空はエラー）※任意入力なら空配列のままでOK
  const REQUIRED_FIELDS = [
    // '希望日'
  ];

  // ====== ユーティリティ ======
  const WEEKDAYS_JA = ['日','月','火','水','木','金','土'];

  // JSTの曜日を取得（Kintoneの日付フィールド値は 'YYYY-MM-DD'）
  const getJstWeekday = (yyyyMMdd) => {
    const [y, m, d] = yyyyMMdd.split('-').map(Number);
    // UTC基準でずれないようDate.UTCを使う
    const date = new Date(Date.UTC(y, m - 1, d));
    return date.getUTCDay(); // 0=日,1=月,...,6=土
  };

  // 単一フィールドの曜日チェック
  const checkField = (rec, fieldCode) => {
    const rule = FIELD_RULES[fieldCode];
    if (!rule) return null; // ルール未設定ならチェックしない

    const field = rec[fieldCode];
    if (!field) return null; // 存在しない（コード違い）ならスキップ

    const val = field.value; // 'YYYY-MM-DD' or ''
    if (!val) {
      if (REQUIRED_FIELDS.includes(fieldCode)) {
        const msg = '必須です。';
        field.error = msg;
        return { fieldCode, message: `${fieldCode}: ${msg}` };
      }
      // 任意入力（未入力はOK）
      return null;
    }

    const wd = getJstWeekday(val);
    if (!rule.includes(wd)) {
      const want = rule.map(n => WEEKDAYS_JA[n]).join('・');
      const msg = ` ${want} のみ選択可能です。`;
      field.error = `${msg}`;
      return { fieldCode, message: `${fieldCode}: ${msg}` };
    }

    // OKならエラー表示をクリア
    field.error = null;
    return null;
  };

  // 変更時チェック（入力時に即フィードバック）
  const buildChangeEvents = () => {
    const events = [];
    Object.keys(FIELD_RULES).forEach(code => {
      events.push(`app.record.create.change.${code}`);
      events.push(`app.record.edit.change.${code}`);
    });
    return events;
  };

  // ------ 変更時イベント ------
  kintone.events.on(buildChangeEvents(), (event) => {
    const changedField = event.type.split('.').pop(); // フィールドコード
    // 変更されたフィールドだけチェック
    checkField(event.record, changedField);
    return event;
  });

  // ------ 保存時イベント（全フィールド一括チェック） ------
  kintone.events.on(['app.record.create.submit', 'app.record.edit.submit'], (event) => {
    const rec = event.record;
    const errors = [];

    // 必須チェックと曜日チェック
    // 1) ルール対象フィールドを全チェック
    for (const code of Object.keys(FIELD_RULES)) {
      const res = checkField(rec, code);
      if (res) errors.push(res.message);
    }
    // 2) ルール対象外だが必須にしたいフィールドがあれば、ここで別途チェック
    for (const code of REQUIRED_FIELDS) {
      if (!FIELD_RULES[code]) {
        const f = rec[code];
        if (f && !f.value) {
          const msg = '必須です。';
          f.error = msg;
          errors.push(`${code}: ${msg}`);
        }
      }
    }

    if (errors.length) {
      event.error = errors.join('\n');
    }
    return event;
  });

})();
