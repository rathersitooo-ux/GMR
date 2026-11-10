// バグ報告の核（2026-11-10、第1弾の未回答3「バグ報告の宝探し」の土台）。
//
// 土台になる決め（正本側の記述）：
// - バグ・不具合・要望の報告は、パートナーへの貢献行動として扱う。
// - 成立した一意な報告だけが、好感度の上昇の対象になる。
// - 送信ボタンの連打・再送・重複・却下された報告は、重ねて数えない。
// - 本体（クライアント）側が、好感度の増分を自分で決めて申告してはならない。
//   増えるかどうかは、報告の状態（成立したかどうか）からだけ決まる。
//
// この核は「報告の登録と、数え方の規則」だけを持つ。送る仕組み（サーバー）
// と、好感度そのものへの接続は別段。

// 報告の指紋：同じ内容の重複を見分けるための印（題と本文の単純な要約）。
export function reportFingerprint(report) {
  const text = `${report.title ?? ''}\n${report.body ?? ''}`.trim().toLowerCase();
  let hash = 0;
  for (let i = 0; i < text.length; i++) hash = (hash * 31 + text.charCodeAt(i)) | 0;
  return `fp${(hash >>> 0).toString(36)}-${text.length}`;
}

export function createBugReportBook() {
  return { reports: [] }; // { id, fingerprint, title, body, status }
}

// 報告を登録する。status は received（受け取り）で始まる。
// 同じ指紋の報告が既にある場合は、重複として印を付けて返す（数えない）。
export function submitReport(book, report) {
  const fingerprint = reportFingerprint(report);
  const duplicate = book.reports.some((r) => r.fingerprint === fingerprint && r.status !== 'rejected');
  const entry = {
    id: `report-${book.reports.length + 1}`,
    fingerprint,
    title: report.title ?? '',
    body: report.body ?? '',
    status: duplicate ? 'duplicate' : 'received',
  };
  book.reports.push(entry);
  return entry;
}

// 報告の判定を進める（成立 established ／ 却下 rejected）。
// 重複の印が付いた報告は、成立には進めない。
export function judgeReport(book, reportId, verdict) {
  const entry = book.reports.find((r) => r.id === reportId);
  if (!entry) throw new Error(`unknown report: ${reportId}`);
  if (entry.status === 'duplicate') return entry;
  if (verdict !== 'established' && verdict !== 'rejected') throw new Error(`unknown verdict: ${verdict}`);
  entry.status = verdict;
  return entry;
}

// 好感度に数えてよい報告の数。成立した一意な報告だけ。
// クライアントが増分を申告する口は持たない（この数が唯一の根拠）。
export function contributionCount(book) {
  return book.reports.filter((r) => r.status === 'established').length;
}
