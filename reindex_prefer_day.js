(function () {
  'use strict';

  /** ******************************
   *  設定
   *********************************/
  const TAG         = '[reindex_next_index]';
  const FIELD_DATE  = '希望日';           // 日付フィールド（コード）
  const FIELD_INDEX = '次回インデックス'; // 数値フィールド（コード）
  const DELAY_MS    = 10_000;             // 遅延実行時間（ms）

  /** ******************************
   *  ユーティリティ
   *********************************/
  // JSTで YYYY-MM-DD
  const todayJST = () =>
    new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Tokyo' });

  // /records ページング GET
  const fetchAll = async (query, fields = []) => {
    const app = kintone.app.getId();
    const limit = 500;
    let offset = 0, all = [];
    while (true) {
      const resp = await kintone.api(kintone.api.url('/k/v1/records.json', true), 'GET', {
        app,
        query: `${query} limit ${limit} offset ${offset}`,
        fields
      });
      all = all.concat(resp.records);
      if (resp.records.length < limit) break;
      offset += limit;
    }
    return all;
  };

  // /records 100件ずつ PUT
  const bulkPut = async (records) => {
    if (!records.length) return;
    const app = kintone.app.getId();
    for (let i = 0; i < records.length; i += 100) {
      const part = records.slice(i, i + 100);
      await kintone.api(kintone.api.url('/k/v1/records.json', true), 'PUT', { app, records: part });
    }
  };

  /** ******************************
   *  コア処理：次回日でインデックス付け
   *********************************/
  const reindexNextDates = async () => {
    const today = todayJST();

    // 今日以降
    const future = await fetchAll(
      `${FIELD_DATE} >= "${today}" order by ${FIELD_DATE} asc`,
      ['$id', FIELD_DATE, FIELD_INDEX]
    );

    // ユニーク日付ごとに rank 付け
    const uniqueDates = [];
    const seen = new Set();
    for (const r of future) {
      const d = r[FIELD_DATE]?.value;
      if (d && !seen.has(d)) { seen.add(d); uniqueDates.push(d); }
    }
    const rankMap = new Map(uniqueDates.map((d, i) => [d, i]));

    // 未来側：差分のみ更新
    const toUpdateFuture = future
      .map(r => {
        const id = r.$id?.value;
        const date = r[FIELD_DATE]?.value;
        const want = rankMap.get(date);
        const cur  = r[FIELD_INDEX]?.value === '' ? null : Number(r[FIELD_INDEX]?.value);
        return (id && cur !== want) ? { id, record: { [FIELD_INDEX]: { value: want } } } : null;
      })
      .filter(Boolean);

    // 過去側：残っているインデックスをクリア
    const pastIndexed = await fetchAll(
      `${FIELD_DATE} < "${today}" and ${FIELD_INDEX} != ""`,
      ['$id', FIELD_INDEX, FIELD_DATE]
    );
    const toClearPast = pastIndexed.map(r => ({
      id: r.$id.value,
      record: { [FIELD_INDEX]: { value: '' } }
    }));

    await bulkPut(toUpdateFuture);
    await bulkPut(toClearPast);

    return {
      uniqueDates: uniqueDates.length,
      updatedFuture: toUpdateFuture.length,
      clearedPast: toClearPast.length
    };
  };

  /** ******************************
   *  イベント
   *********************************/
  kintone.events.on('app.record.detail.process.proceed', (event) => {
    console.info(`${TAG} process.proceed -> schedule reindex in ${DELAY_MS / 1000}s`);

    setTimeout(async () => {
      try {
        const res = await reindexNextDates();
        console.info(`${TAG} reindex executed after delay`, res);
      } catch (e) {
        console.error(`${TAG} reindex failed`, e);
      }
    }, DELAY_MS);

    return event;
  });

  console.info(`${TAG} loaded at`, new Date().toISOString());
})();
