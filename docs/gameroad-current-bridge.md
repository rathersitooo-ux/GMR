# GAMEROAD PC CURRENT Bridge

## 目的

Windows PC を常駐実行面として使い、非公開 Google Drive の CURRENT を毎回直接読み直しながら、**正式取得 → 既存 Executor Bus → FREE_LOCAL_CODER 候補 → fresh CURRENT 採用 → 既存 Required Gate / auto-merge → release** を、1件の bounded packet について最後まで監督する。

この橋は第二の作業台帳・第二の CURRENT・第二の実装系を作らない。Drive の全文や `CURRENT_ACTIVE_LEASES` の複製を GitHub へ保存しない。候補生成は既存 `FREE_LOCAL_CODER` が担当し、橋はその候補を fresh authority で採用するだけである。

## 1 packet の状態遷移

1. PC上の `executor-packet.json` を読む。
2. private Drive の CURRENT root、current event ledger pointer、`CURRENT_ACTIVE_LEASES` を fresh read する。
3. packet の `AcquireKey` が未使用で、current main が `baseRef` と一致し、他の有効 lease と exact mutable resources が競合しないことを確認する。
4. current event ledger へ ACQUIRE を strict revision 付きで先に追記する。
5. `CURRENT_ACTIVE_LEASES` の空き行へ自分の lease を書く。行には `AcquireEventBacking=R24_ACQUIRE_PRESENT:<AcquireKey>` を必須で持たせ、同じ行を readback して完全一致を確認する。ACTIVE行を利用する前はmarker一致だけでなく、current R24本文に同じAcquireKeyの `EVENT=ACQUIRE` が実在することも確認する。
6. owner本人のローカル GitHub token で既存 `[EXECUTOR]` Issue を1件だけ作る。既存 Issue marker があれば再送しない。
7. 既存 `GAMEROAD Executor Bus` が `FREE_LOCAL_CODER` を使い、bounded candidate、focused test、draft PR を返す。
8. PC bridge は返却された `executor-result` の TaskID / WorkUnitKey / AcquireKey / candidate PR / commit を照合する。
9. **採用直前に private CURRENT と main をもう一度 fresh read** する。lease が短くなっていれば scope を変えずに最大60分へ更新し、readbackする。
10. `work/pc-current-adopt-*` 枝を current main から作る。
11. その枝の最初のcommitを PRE_ACTION manifest 1ファイルだけにする。
12. candidate PR の変更pathが lease scope 内だけであることを確認し、そのblobだけを採用枝へ写す。
13. transient PRE_ACTION manifest を最後のcleanup commitで削除し、main向け non-draft PR を開く。
14. mergeは橋自身では行わない。既存 `GAMEROAD Required Gate` と `Required Gate auto-merge` に委ねる。
15. 次の定期実行で adoption PR の merge を確認し、そのmerge commitが current main の履歴にあることを確認する。
16. 自分の active lease 行をclearし、消えたことをreadbackしてから current event ledgerへ RELEASE を追記する。
17. release後にも lease 行が存在しないことをもう一度readbackし、packetを `*.completed-pr-<番号>.json` へrenameする。

packet は dispatch 時点では消さない。これにより、10分ごとの同じ supervisor が GitHub 上の durable marker / Issue / PR を見て同じ仕事を二重送信せず、次の状態だけへ進める。

## PC側で一度だけ必要な設定

### GitHub self-hosted runner

対象repoの self-hosted Windows runner を `self-hosted`, `Windows`, `X64` ラベルで使えるようにし、Windowsサービスとして常駐させる。

### Google private Drive 認証

runnerサービスと同じ専用Windowsユーザーに Google Application Default Credentials を置く。必要scopeは次の3つ。

- `https://www.googleapis.com/auth/drive`
- `https://www.googleapis.com/auth/documents`
- `https://www.googleapis.com/auth/spreadsheets`

認証情報ファイル、refresh token、OAuth client secretはrepoへcommitしない。

### owner GitHub token

repo owner本人の fine-grained token をPCだけに保存し、runnerサービス環境変数 `GAMEROAD_GITHUB_TOKEN` として渡す。対象repoについて少なくとも以下が必要。

- Metadata: read
- Contents: read/write
- Issues: read/write
- Pull requests: read/write

このtokenはrepoファイル、GitHub Actions secret、Drive CURRENTへ複製しない。

### packet置場

既定は `C:\GAMEROAD\executor-packet.json`。別pathを使う場合はWindowsサービス環境変数 `GAMEROAD_CURRENT_BRIDGE_PACKET` を設定する。

## packet契約

既存 Executor Bus v1 の queue packet をそのまま使う。

```json
{
  "schemaVersion": "gameroad-executor-bus-v1",
  "kind": "queue",
  "taskId": "CURRENTのTaskID",
  "workUnitKey": "今回のWorkUnitKey",
  "acquireKey": "未使用の新しいAcquireKey",
  "baseRef": "現在mainの40文字SHA",
  "exactMutableResources": ["browser/example.mjs", "tests/example.test.mjs"],
  "doNotChange": ["変更禁止path"],
  "userEndState": "利用者成果",
  "realOutputTarget": "実出力",
  "acceptance": ["成立条件"],
  "resumeCondition": "draft candidate PR返却",
  "executorCapabilityHint": "FREE_LOCAL_CODER"
}
```

橋はpacketの意味をCURRENTへ昇格させない。対象Task/WorkUnitそのものの選定・設計判断はpacket作成側の責務で、橋は1 packet の authority transport / candidate adoption / release を担当する。

## Fail closed

以下はすべて「勝手に代替処理」ではなく停止になる。

- Google認証 / Docs / Sheets read-write不能
- current event ledger pointer不明
- event ledger strict revision write失敗
- AcquireKey再利用
- active leaseの同一path競合
- lease row write / clear のreadback不一致
- ACTIVE lease の `AcquireEventBacking` 欠落・AcquireKey不一致
- current R24 に対応する `EVENT=ACQUIRE` が存在しないACTIVE lease
- TaskID / WorkUnitKey / AcquireKey / scope不一致
- main SHA移動
- control-plane pathを候補packetで変更しようとする
- focused Node testを含まないpacket
- `FREE_LOCAL_CODER` 未指定
- GitHub tokenがrepo owner本人でない
- Executor result identity不一致
- candidate PRがpacket scope外を変更
- candidate PR / commit ref不一致
- fresh adoption前にleaseまたはmainが変化
- adoption PRがmergeされずclose
- merge commitがcurrent main履歴に無い

## 既存gateを弱めない理由

FREE_LOCAL_CODER のdraft PRを直接mergeしない。candidateを fresh CURRENT で再確認した後、別の `work/*` 採用枝へ移し、そこに現行PRE_ACTION contractを適用する。最初のcommitはmanifest-only、製品候補を次commitへ写し、manifestは最終treeからcleanup削除する。

採用PRは existing `Required Gate auto-merge` が既に要求している `work/*` namespace に置く。そのため橋はRequired Gateを代替せず、既存gateが成功した exact tested head だけがmerge対象になる。

## 現在の実証境界

このコードとGitHub上のunit/Required Gateが通っても、**Windows実機上のGoogle ADC・owner token・self-hosted runnerが実際に一連のprivate read/writeとGitHub操作を通した証拠が無ければ、完全自律成立とは扱わない。**

実機合格は最低でも次の1件を完走して確認する。

`private CURRENT fresh read → event-first acquire → lease write/readback → Executor dispatch → FREE_LOCAL_CODER returned candidate → fresh pre-adoption CURRENT → PRE_ACTION adoption PR → existing Required Gate/auto-merge → main readback → lease clear/readback → RELEASE → final readback`

## Windows GUI補完lane

Desktop Commanderは外さず、既存のself-hosted Windows runnerとCURRENT Bridgeへ、限定されたGUI操作laneを併設する。
PC側は `sbroenne/mcp-windows` の `wincli` v1.3.24 を固定版として使い、取得物のSHA-256を照合してから利用する。

GitHub Issueはrepo owner本人が作成した `[WINDOWS-GUI]` 要求だけを受け付ける。
要求は `gameroad-windows-gui-v1` のJSON argvで表現し、初期版はwindow/UI/clipboard/keyboard/mouseの限定操作だけを許可する。
任意のコマンド実行や広いOS変更はこのlaneの対象外とする。

結果は同じIssueへbounded commentとして返す。送信成功と対象アプリ上の目的達成は分け、必要なら次のread/snapshotで状態を確認する。

最初の実機acceptanceはwindow一覧を取得し、self-hosted runnerからinteractive desktopが見えるかを確認する。
Windowsサービスのsession境界で見えない場合は、このlaneを完成扱いせず、既存のinteractive Scheduled Taskへの最小handoffを検討する。

このlaneは既存CURRENT Bridgeの補完であり、第二CURRENT、第二task table、第二executor busは作らない。
