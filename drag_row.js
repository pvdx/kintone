(function () {
  'use strict';

  const DRAGGABLE_USERS = ['*'];

  const SORT_FIELD_CODE = '表示用番号';

  const loadScript = (src) => {
    return new Promise((resolve) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      document.head.appendChild(script);
    });
  };

  const isUserAllowed = () => {
    const login = kintone.getLoginUser();
    const code = login.code;
    const name = login.name;

    if (DRAGGABLE_USERS.includes('*')) return true;
    return DRAGGABLE_USERS.includes(code) || DRAGGABLE_USERS.includes(name);
  };

  kintone.events.on('app.record.index.show', async function () {
    console.log('✅ index.show 発火');

    if (document.getElementById('sortable-loaded')) {
      console.log('⚠️ すでに読み込み済み');
      return;
    }

    await loadScript('https://cdn.jsdelivr.net/npm/sortablejs@1.15.0/Sortable.min.js');
    console.log('✅ Sortable 読み込み完了');

    const flag = document.createElement('div');
    flag.id = 'sortable-loaded';
    document.body.appendChild(flag);

    const tbody = document.querySelector('.recordlist-gaia tbody');
    console.log('🔍 tbody:', tbody);
    if (!tbody) {
      console.log('❌ tbody が見つかりません');
      return;
    }

    const allowed = isUserAllowed();

    Sortable.create(tbody, {
      animation: 150,
      disabled: !allowed,
      onEnd: async function () {
        if (!allowed) {
          console.warn('⛔ 並び替え権限がないため処理しません');
          return;
        }

        console.log('🔄 並び替え発生');

        const rows = Array.from(tbody.rows);
        const updates = [];

        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          const link = row.querySelector('a.recordlist-show-gaia');
          if (!link) continue;

          const match = link.href.match(/record=(\d+)/);
          if (!match) continue;

          const recordId = match[1];
          const newSortValue = i + 1;

          updates.push({
            id: recordId,
            record: {
              [SORT_FIELD_CODE]: {
                value: parseInt(newSortValue, 10)
              }
            }
          });
        }

        console.log('📦 更新データ:', updates);

        try {
          const CHUNK_SIZE = 200;
          for (let i = 0; i < updates.length; i += CHUNK_SIZE) {
            const chunk = updates.slice(i, i + CHUNK_SIZE);
            const res = await kintone.api(kintone.api.url('/k/v1/records', true), 'PUT', {
              app: kintone.app.getId(),
              records: chunk
            });
            console.log('✅ 更新成功:', res);
          }

          // 必要なら再読み込み
          // location.reload();
        } catch (error) {
          console.error('❌ 更新失敗:', error);
        }
      }
    });

  });
})();
