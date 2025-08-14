(function () {
  'use strict';

  // ================== 設 定 ==================
  // 有効ユーザー（'*' で全員可。ユーザーコード or 表示名）
  const ENABLE_USERS = ['*'];            // 例: ['user_a', '山田 太郎'] or ['*']
  // 有効ビューID（'*' で全ビュー可）。数値/文字列どちらでもOK
  const ENABLE_VIEWS = ['*'];            // 例: [123456, 789012] or ['*']

  // フィールドコード
  const FIELD_STATUS        = 'ステータス';
  const FIELD_GROUP         = '班';        // 組織選択 or 文字列（組織名）
  const FIELD_ASSIGNEE_NAME = '担当者名';  // 文字列(1行)
  const FIELD_ORDER         = '表示用番号'; // 数値フィールド推奨

  // バルク更新の分割件数
  const BULK_CHUNK_SIZE = 200;

  // ================== 共 通 関 数 ==================
  const loadScript = (src) => {
    return new Promise((resolve) => {
      if (document.querySelector(`script[src="${src}"]`)) return resolve();
      const script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      document.head.appendChild(script);
    });
  };

  const isUserEnabled = () => {
    const login = kintone.getLoginUser();
    const code = login.code;
    const name = login.name;
    if (ENABLE_USERS.includes('*')) return true;
    return ENABLE_USERS.includes(code) || ENABLE_USERS.includes(name);
  };

  const isViewEnabled = (viewId) => {
    if (ENABLE_VIEWS.includes('*')) return true;
    const target = String(viewId);
    return ENABLE_VIEWS.map(String).includes(target);
  };

  // record['班'] から組織名（最初の1件）を取得
  const pickGroupName = (record) => {
    const v = record[FIELD_GROUP] && record[FIELD_GROUP].value;
    if (Array.isArray(v) && v.length > 0 && v[0] && typeof v[0].name === 'string') return v[0].name;
    if (typeof v === 'string') return v;
    return '';
  };

  // 組織名 "実査_1班" ～ "実査_4班" → 1～4、それ以外は 5
  const groupRankFromName = (name) => {
    if (typeof name !== 'string') return 5;
    const m = name.match(/実査_(\d)班/);
    if (!m) return 5;
    const n = Number(m[1]);
    return (n >= 1 && n <= 4) ? n : 5;
  };

  // 指定班順（例: ['1','3','2','4']）に対する比較用インデックスを返す
  // 見つからなければ大きな数を返して「最後」に送り、同点なら数値のgrankで比較できるよう別返り値も返す
  const orderIndex = (rank, orderArray) => {
    const idx = orderArray.indexOf(String(rank));
    return (idx === -1) ? Number.POSITIVE_INFINITY : idx;
  };

  // 表示用番号をまとめて更新（数値で送る）
  const bulkUpdateOrder = async (appId, updates) => {
    for (let i = 0; i < updates.length; i += BULK_CHUNK_SIZE) {
      const chunk = updates.slice(i, i + BULK_CHUNK_SIZE);
      const payload = {
        app: appId,
        records: chunk.map(u => ({
          id: u.id,
          record: { [FIELD_ORDER]: { value: Number(u.order) } } // 数値で送る
        }))
      };
      await kintone.api(kintone.api.url('/k/v1/records', true), 'PUT', payload);
    }
  };

  // ================== イ ベ ン ト ==================
  kintone.events.on('app.record.index.show', async function (event) {
    const viewId = event.viewId;
    const allowedUser = isUserEnabled();
    const allowedView = isViewEnabled(viewId);
    if (!(allowedUser && allowedView)) return event;

    // SortableJS を一度だけ読み込み
    if (!document.getElementById('sortable-loaded-flag')) {
      await loadScript('https://cdn.jsdelivr.net/npm/sortablejs@1.15.0/Sortable.min.js');
      const flag = document.createElement('div');
      flag.id = 'sortable-loaded-flag';
      flag.style.display = 'none';
      document.body.appendChild(flag);
    }

    // 自動並び替えボタン（一度だけ設置）
    if (!document.getElementById('auto-sort-btn')) {
      const header = kintone.app.getHeaderMenuSpaceElement();
      const btn = document.createElement('button');
      btn.id = 'auto-sort-btn';
      btn.textContent = '自動並び替え（ステータス→指定班順→担当者）';
      btn.className = 'kintoneplugin-button-normal';
      btn.style.marginLeft = '8px';
      header.appendChild(btn);

      btn.onclick = async () => {
        const appId = kintone.app.getId();
        const allRecords = event.records || [];
        if (allRecords.length === 0) {
          alert('並び替えるレコードがありません。');
          return;
        }

        // ユーザーに班順を聞く（例: 1,3,2,4）
        const text = prompt('班順をカンマ区切りで指定してください（例: 1,3,2,4）', '1,2,3,4');
        if (text == null) return; // キャンセル
        const orderArray = text
          .split(',')
          .map(s => s.trim())
          .filter(s => s.length > 0);

        if (orderArray.length === 0) {
          alert('班順が空です。処理を中断しました。');
          return;
        }

        // 並び替え用のキー作成
        const keyed = allRecords.map(r => {
          const status   = (r[FIELD_STATUS]?.value) ?? '';
          const gname    = pickGroupName(r);
          const grank    = groupRankFromName(gname);                // 1〜4 or 5
          const assignee = (r[FIELD_ASSIGNEE_NAME]?.value) ?? '';
          const id       = r.$id.value;
          return { id, status, grank, assignee };
        });

        // ステータス → 指定班順 → 担当者名
        keyed.sort((a, b) => {
          // 1) ステータス
          const s = a.status.localeCompare(b.status, 'ja');
          if (s !== 0) return s;

          // 2) 指定された班順（見つからない rank は最後へ）
          const ia = orderIndex(a.grank, orderArray);
          const ib = orderIndex(b.grank, orderArray);
          if (ia !== ib) return ia - ib;

          // 同点（どちらも未指定など）の場合は、grank 数値昇順で安定化
          if (a.grank !== b.grank) return a.grank - b.grank;

          // 3) 担当者名
          return a.assignee.localeCompare(b.assignee, 'ja');
        });

        const updates = keyed.map((r, i) => ({ id: r.id, order: i + 1 }));

        try {
          await bulkUpdateOrder(appId, updates);
          alert('指定班順での自動並び替えと表示用番号の更新が完了しました。必要に応じて一覧を再読み込みしてください。');
        } catch (e) {
          console.error(e);
          alert('更新中にエラーが発生しました。コンソールを確認してください。');
        }
      };
    }

    // 手動ドラッグによる並び替え（権限ある人＆対象ビューのみ）
    const tbody = document.querySelector('.recordlist-gaia tbody');
    if (!tbody) return event;
    if (tbody.getAttribute('data-sortable-initialized') === '1') return event;

    Sortable.create(tbody, {
      animation: 150,
      disabled: !(allowedUser && allowedView),
      onEnd: async function () {
        try {
          const rows = Array.from(tbody.rows);
          const updates = [];

          for (let i = 0; i < rows.length; i++) {
            const link = rows[i].querySelector('a.recordlist-show-gaia');
            if (!link) continue;
            const m = link.href.match(/record=(\d+)/);
            if (!m) continue;
            updates.push({ id: m[1], order: i + 1 });
          }

          if (updates.length === 0) return;
          await bulkUpdateOrder(kintone.app.getId(), updates);
          // 必要なら: location.reload();
        } catch (err) {
          console.error('ドラッグ更新失敗:', err);
          alert('並び順の更新に失敗しました。コンソールを確認してください。');
        }
      }
    });

    tbody.setAttribute('data-sortable-initialized', '1');
    return event;
  });
})();
