(async () => {
  // ===== 設定 =====
  const APP_ID = kintone.app.getId();
  const PREDICT_FIELD = '予想ステータス';   // フィールドコード（同名ならこのままでOK）
  const FROM_STATUS = '未処理';

  // もし「アクション名」が「遷移先ステータス」と違う場合はここで対応
  // 例: 未処理→承認 のとき、ボタン名が「承認へ」なら {'未処理->承認':'承認へ'}
  const ACTION_NAME_MAP = {
    // '未処理->承認': '承認へ',
    // '未処理->却下': '却下する',
  };

  // ===== ユーティリティ =====
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const chunk = (arr, size) => arr.reduce((a,_,i) => (i%size? a[a.length-1].push(arr[i]) : a.push([arr[i]]), a), []);

  function resolveActionName(fromStatus, toStatus) {
    return ACTION_NAME_MAP[`${fromStatus}->${toStatus}`] || toStatus;
  }

  async function fetchRecordsByQuery(app, query, fields = ['$id', PREDICT_FIELD]) {
    const all = [];
    let offset = 0;
    const limit = 500;
    while (true) {
      const res = await kintone.api('/k/v1/records', 'GET', {
        app, query: `${query} limit ${limit} offset ${offset}`, fields
      });
      all.push(...res.records);
      if (res.records.length < limit) break;
      offset += limit;
      await sleep(150); // 過剰リクエスト回避
    }
    return all;
  }

  // ===== 取得（未処理 かつ 予想ステータスあり）=====
  const baseQuery = `ステータス in ("${FROM_STATUS}") and ${PREDICT_FIELD} != "" order by $id asc`;
  const records = await fetchRecordsByQuery(APP_ID, baseQuery);

  if (records.length === 0) {
    console.log('対象レコードはありません。');
    return;
  }

  console.log(`対象 ${records.length} 件を処理します…`);

  // ===== リクエスト作成 =====
  const ops = records.map(r => {
    const id = r.$id.value;
    const toStatus = r[PREDICT_FIELD].value;
    const action = resolveActionName(FROM_STATUS, toStatus);
    return { id, action };
  });

  // ===== 実行（/k/v1/records/status.json をバッチで）=====
  // 100件/回 目安
  const batches = chunk(ops, 100);
  const results = { ok: 0, ng: [] };

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    try {
      await kintone.api('/k/v1/records/status.json', 'PUT', {
        app: APP_ID,
        records: batch
      });
      results.ok += batch.length;
      console.log(`✅ ${i+1}/${batches.length} バッチ完了 (${batch.length}件)`);
    } catch (e) {
      console.error(`❌ ${i+1}/${batches.length} バッチ失敗`, e);
      // 失敗時は1件ずつ試して失敗IDを把握
      for (const rec of batch) {
        try {
          await kintone.api('/k/v1/record/status.json', 'PUT', {
            app: APP_ID,
            id: rec.id,
            action: rec.action
          });
          results.ok += 1;
          console.log(`  ↪️ 単発成功: #${rec.id}`);
        } catch (ee) {
          results.ng.push({ id: rec.id, action: rec.action, error: ee });
          console.warn(`  ↪️ 単発失敗: #${rec.id} (action="${rec.action}")`, ee);
        }
        await sleep(120);
      }
    }
    await sleep(250);
  }

  console.log('--- 処理結果 ---');
  console.log(`成功: ${results.ok} 件`);
  if (results.ng.length) {
    console.log(`失敗: ${results.ng.length} 件`, results.ng);
    console.log('※ アクション名がボタン名と一致しているか、権限/プロセス条件/作業者の割当が必要かをご確認ください。');
  } else {
    console.log('すべて成功しました。');
  }
})();
