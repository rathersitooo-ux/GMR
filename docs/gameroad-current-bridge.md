# GAMEROAD PC CURRENT Bridge

## 目的

Windows PC を常駐実行面として使い、非公開 Google Drive の CURRENT を毎回直接読み直してから、正式取得済みの1件だけを既存 `GAMEROAD Executor Bus` へ渡す。

この橋は第二の作業台帳・第二のCURRENT・第二の実装系を作らない。Drive の全文や `CURRENT_ACTIVE_LEASES` の複製を GitHub へ保存しない。候補生成は既存 `FREE_LOCAL_CODER` が担当し、橋自身はコード候補を生成・mergeしない。

## 実行経路

1. GitHub self-hosted runner を Windows サービスとして常駐させる。
2. `GAMEROAD PC CURRENT Bridge` は10分間隔で Windows runner を呼ぶ。Windows Task Scheduler は使わない。
3. PC上の `C:\GAMEROAD\executor-packet.json`（または `GAMEROAD_CURRENT_BRIDGE_PACKET`）が無ければ何もしない。
4. packet がある場合だけ private Drive の CURRENT root と `CURRENT_ACTIVE_LEASES` を fresh read する。
5. TaskID / WorkUnitKey / AcquireKey / lease期限 / exact mutable resources / current main SHA を照合する。
6. owner本人のローカル GitHub token で既存 `[EXECUTOR]` Issue を作る。
7. 既存 Executor Bus が `FREE_LOCAL_CODER` の安全境界、focused test、draft PR生成を担当する。
8. 同じAcquireKeyの `[EXECUTOR]` Issue が既にあれば再送しない。成功したpacketはPC上で `*.dispatched-<issue>.json` へrenameする。

## 一度だけ必要なPC設定

### 1. GitHub self-hosted runner

対象repoの self-hosted Windows runner を設定し、`self-hosted`, `Windows`, `X64` ラベルで実行できるようにする。runnerはWindowsサービスとして、下記Google認証を持つ同じ専用Windowsユーザーで動かす。

### 2. Google private Drive認証

そのWindowsユーザーで Google Application Default Credentials を作る。必要scopeは次の3つ。

- `https://www.googleapis.com/auth/drive`
- `https://www.googleapis.com/auth/documents`
- `https://www.googleapis.com/auth/spreadsheets`

認証情報ファイル、refresh token、OAuth client secretはrepoへcommitしない。runnerサービスから同じユーザーのADCを読める状態にする。

### 3. owner GitHub token

repo owner本人の fine-grained token をPCだけに保存し、runnerサービス環境変数 `GAMEROAD_GITHUB_TOKEN` として渡す。最低限、対象repoのMetadata read、Contents read、Issues read/writeを許可する。token自体はGitHub Actions secret、repoファイル、Drive CURRENTへ複製しない。

### 4. packet置場

既定は `C:\GAMEROAD\executor-packet.json`。別pathを使う場合はWindowsサービス環境変数 `GAMEROAD_CURRENT_BRIDGE_PACKET` を設定する。

runnerサービスの実行ユーザーまたは環境変数を変更した場合はrunnerサービスを再起動し、同じWindowsユーザーでADCとpacketを読めることを確認する。

## packet契約

既存 Executor Bus v1 をそのまま使う。

```json
{
  "schemaVersion": "gameroad-executor-bus-v1",
  "kind": "queue",
  "taskId": "CURRENTのTaskID",
  "workUnitKey": "正式取得済みWorkUnitKey",
  "acquireKey": "CURRENT_ACTIVE_LEASESのAcquireKey",
  "baseRef": "現在mainの40文字SHA",
  "exactMutableResources": ["browser/example.mjs", "tests/example.test.mjs"],
  "doNotChange": ["変更禁止path"],
  "userEndState": "利用者成果",
  "realOutputTarget": "実出力",
  "acceptance": ["成立条件"],
  "resumeCondition": "draft PR返却",
  "executorCapabilityHint": "FREE_LOCAL_CODER"
}
```

橋はpacketの意味をCURRENTへ昇格させない。live leaseと一致しないpacket、期限切れlease、複数一致、scope不一致、main進行、control-plane path、FREE_LOCAL_CODER未指定は送信0で停止する。

## 現在の境界

R45は **private CURRENT → 正式取得済みpacket → 既存Executor Bus** の非ChatGPT transportを閉じる作業である。owner-free作業をPC自身が選びformal acquireするselectorはこの橋とは別責務であり、R45の合格前に推測実装しない。

したがってR45のコードmergeだけで「完全自律」を主張しない。実PCで次の一連が成立して初めてPC transport acceptanceになる。

`private CURRENT fresh read → live lease照合 → owner-authenticated [EXECUTOR] issue → Executor Bus accepted → FREE_LOCAL_CODER candidate/draft PR → fresh CURRENTで採否判定`

## Fail closed

- Google認証/Drive読取不能 → Issue作成0
- CURRENT root revision取得不能 → Issue作成0
- live lease 0件/複数/期限切れ → Issue作成0
- Task/WorkUnit/AcquireKey/scope不一致 → Issue作成0
- main SHA不一致 → Issue作成0
- GitHub tokenがrepo owner本人でない → Issue作成0
- 同AcquireKeyが既にdispatch済み → 再送0
- tokenやDrive本文をログ/Issueへ出力しない
