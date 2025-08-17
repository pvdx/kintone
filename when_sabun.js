--- before.js
+++ after.js
@@
   function parseList(str) {
     return String(str ?? '').split(',').map(s => s.trim()).filter(Boolean);
   }

isEmptyField変更
	function isEmptyField(value) {
	  if (value === null || value === undefined) return true;

	  // 文字列（日付/日時/時刻/テキスト/数値が文字列で来るケース含む）
	  if (typeof value === 'string') return value.trim() === '';

	  // ユーザー選択/組織選択/グループ選択/複数選択/チェックボックスなど
	  if (Array.isArray(value)) return value.length === 0;

	  // 数値が number 型で来る場合（0 は値あり）
	  if (typeof value === 'number') return false;

	  // 一部カスタムで { value: ... } だけを渡すケースの保険
	  if (typeof value === 'object') {
	    if ('value' in value && Object.keys(value).length <= 2) {
	      return isEmptyField(value.value);
	    }
	    // オブジェクトでキーが無ければ空扱い
	    return Object.keys(value).length === 0;
	  }

	  return false;
	}
 
   function cmpDatesOrNumbers(a, b) {
-    const na = Number(a), nb = Number(b);
-    if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
-    return String(a).localeCompare(String(b));
+    const sa = String(a ?? '');
+    const sb = String(b ?? '');
+    // 空文字が絡む場合は数値比較に落とさず文字列比較へ
+    if (sa.trim() === '' || sb.trim() === '') return sa.localeCompare(sb);
+    const na = Number(sa), nb = Number(sb);
+    if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
+    // ISO日付(YYYY-MM-DD)は文字列比較でも時系列順になる
+    return sa.localeCompare(sb);
   }
 
   // isnull / notnull / isin / notisin 対応
   function evaluateCondition(record, fieldCode, mark, condVal) {
     if (!fieldCode) return true; // no condition
     const recVal = getRecordPrimitive(record, fieldCode);
     const op = (mark || '').toLowerCase();
 
     if (op === '' || op === 'any') return true;
     if (op === 'empty' || op === 'isnull') return isEmptyField(recVal);
     if (op === 'notempty' || op === 'notnull') return !isEmptyField(recVal);
 
-    const leftArr = Array.isArray(recVal) ? recVal : [recVal];
-    const rightArr = Array.isArray(condVal) ? condVal : parseList(condVal);
-    const leftScalar = Array.isArray(recVal) ? null : recVal;
-    const rightScalar = rightArr.length === 1 ? rightArr[0] : condVal;
+    // 両辺を安全に文字列へ正規化してセット比較の取りこぼしを防止
+    const leftArrRaw = Array.isArray(recVal) ? recVal : [recVal];
+    const leftArr = leftArrRaw.map(v => String(v));
+    const rightArr = (Array.isArray(condVal) ? condVal : parseList(condVal)).map(v => String(v));
+    const leftScalar = Array.isArray(recVal) ? null : String(recVal);
+    const rightScalar = rightArr.length === 1 ? rightArr[0] : String(condVal);
 
     switch (op) {
       case '==':   return String(leftScalar) === String(rightScalar);
       case '!=':   return String(leftScalar) !== String(rightScalar);
       case '>':    return cmpDatesOrNumbers(leftScalar, rightScalar) > 0;
       case '<':    return cmpDatesOrNumbers(leftScalar, rightScalar) < 0;
       case '>=':   return cmpDatesOrNumbers(leftScalar, rightScalar) >= 0;
       case '<=':   return cmpDatesOrNumbers(leftScalar, rightScalar) <= 0;
-      case 'in':   return leftArr.some(v => rightArr.includes(String(v)));
-      case 'notin':return leftArr.every(v => !rightArr.includes(String(v)));
-      case 'isin': return rightArr.some(v => leftArr.includes(String(v)));
-      case 'notisin': return rightArr.every(v => !leftArr.includes(String(v)));
+      case 'in':   return leftArr.some(v => rightArr.includes(v));
+      case 'notin':return leftArr.every(v => !rightArr.includes(v));
+      case 'isin': return rightArr.some(v => leftArr.includes(v));
+      case 'notisin': return rightArr.every(v => !leftArr.includes(v));
       case 'includes':
       case 'contains':
-        return leftArr.some(v => String(v).includes(String(rightScalar)));
+        return leftArr.some(v => v.includes(rightScalar));
       default:     return true;
     }
   }
