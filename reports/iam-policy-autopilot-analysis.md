# IAM Policy Autopilot 検証レポート

## 概要

このレポートは、IAM Policy Autopilot MCP サーバーを使用して Lambda 関数の IAM ポリシーを生成した結果と、その特性・制限事項をまとめたものです。

## 検証対象

| Lambda 関数               | 用途                             | 使用 AWS サービス                         |
| ------------------------- | -------------------------------- | ----------------------------------------- |
| simple-s3-reader          | S3 からファイル読み取り          | S3                                        |
| sqs-dynamodb-processor    | SQS メッセージを DynamoDB に保存 | SQS（イベントソース）、DynamoDB           |
| complex-bedrock-processor | AI 処理パイプライン              | Bedrock、S3、Secrets Manager、EventBridge |

---

## 生成されたポリシー

### 1. simple-s3-reader

**問い合わせパラメータ:**

```json
{
  "ServiceHints": ["s3"],
  "SourceFiles": ["lambda/simple-s3-reader/index.ts"]
}
```

**生成されたポリシー:**

```json
{
  "Id": "IamPolicyAutopilot",
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["kms:Decrypt"],
      "Resource": ["arn:aws:kms:*:*:key/*"],
      "Condition": {
        "StringLike": {
          "kms:ViaService": ["s3.*.amazonaws.com"]
        }
      }
    },
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:GetObjectLegalHold",
        "s3:GetObjectRetention",
        "s3:GetObjectTagging",
        "s3:GetObjectVersion"
      ],
      "Resource": ["arn:aws:s3:*:*:accesspoint/*/object/*", "arn:aws:s3:::*/*"]
    },
    {
      "Effect": "Allow",
      "Action": ["s3-object-lambda:GetObject"],
      "Resource": ["arn:aws:s3:*:*:accesspoint/*/object/*", "arn:aws:s3:::*/*"]
    }
  ]
}
```

**検出された SDK 呼び出し:**

- `GetObjectCommand` → `s3:GetObject` 等

**実装状況:** ✅ IAM Policy Autopilot 提案に完全準拠

---

### 2. sqs-dynamodb-processor

**問い合わせパラメータ:**

```json
{
  "ServiceHints": ["sqs", "dynamodb"],
  "SourceFiles": ["lambda/sqs-dynamodb-processor/index.ts"]
}
```

**生成されたポリシー:**

```json
{
  "Id": "IamPolicyAutopilot",
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["dynamodb:PutItem"],
      "Resource": ["arn:aws:dynamodb:*:*:table/*"]
    },
    {
      "Effect": "Allow",
      "Action": ["kms:Decrypt"],
      "Resource": ["arn:aws:kms:*:*:key/*"],
      "Condition": {
        "StringLike": {
          "kms:ViaService": ["dynamodb.*.amazonaws.com"]
        }
      }
    }
  ]
}
```

**検出された SDK 呼び出し:**

- `PutCommand` → `dynamodb:PutItem`

**検出されなかった権限:**

- `sqs:ReceiveMessage`
- `sqs:DeleteMessage`
- `sqs:GetQueueAttributes`
- `sqs:ChangeMessageVisibility`

**実装状況:** ✅ IAM Policy Autopilot 提案に完全準拠（DynamoDB 部分）

**備考:** SQS 権限は Lambda コード内で SDK を直接呼び出していないため検出不可。SQS イベントソースマッピングで必要な権限は CDK の `SqsEventSource` が自動付与。

---

### 3. complex-bedrock-processor

**問い合わせパラメータ:**

```json
{
  "ServiceHints": ["bedrock", "s3", "secretsmanager", "events"],
  "SourceFiles": ["lambda/complex-bedrock-processor/index.ts"]
}
```

**生成されたポリシー:**

```json
{
  "Id": "IamPolicyAutopilot",
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["bedrock:ApplyGuardrail"],
      "Resource": [
        "arn:aws:bedrock:*:*:guardrail-profile/*",
        "arn:aws:bedrock:*:*:guardrail/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": ["bedrock:CallWithBearerToken", "bedrock:InvokeModel"],
      "Resource": ["*"]
    },
    {
      "Effect": "Allow",
      "Action": ["kms:GenerateDataKey"],
      "Resource": ["arn:aws:kms:*:*:key/*"],
      "Condition": {
        "StringLike": {
          "kms:ViaService": ["s3.*.amazonaws.com"]
        }
      }
    },
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:PutObjectAcl",
        "s3:PutObjectLegalHold",
        "s3:PutObjectRetention",
        "s3:PutObjectTagging"
      ],
      "Resource": ["arn:aws:s3:*:*:accesspoint/*/object/*", "arn:aws:s3:::*/*"]
    },
    {
      "Effect": "Allow",
      "Action": ["s3-object-lambda:PutObject"],
      "Resource": ["arn:aws:s3:*:*:accesspoint/*/object/*", "arn:aws:s3:::*/*"]
    },
    {
      "Effect": "Allow",
      "Action": ["events:PutEvents"],
      "Resource": ["arn:aws:events:*:*:event-bus/*"]
    },
    {
      "Effect": "Allow",
      "Action": ["kms:Decrypt"],
      "Resource": ["arn:aws:kms:*:*:key/*"],
      "Condition": {
        "StringLike": {
          "kms:ViaService": ["secretsmanager.*.amazonaws.com"]
        }
      }
    },
    {
      "Effect": "Allow",
      "Action": ["secretsmanager:GetSecretValue"],
      "Resource": ["arn:aws:secretsmanager:*:*:secret:*"]
    }
  ]
}
```

**検出された SDK 呼び出し:**

- `InvokeModelCommand` → `bedrock:InvokeModel`, `bedrock:CallWithBearerToken`, `bedrock:ApplyGuardrail`
- `PutObjectCommand` → `s3:PutObject` 等
- `GetSecretValueCommand` → `secretsmanager:GetSecretValue`
- `PutEventsCommand` → `events:PutEvents`

**実装状況:** ✅ IAM Policy Autopilot 提案に完全準拠

---

## IAM Policy Autopilot の特性

### 強み

1. **SDK 呼び出しの正確な検出**

   - Lambda コード内の AWS SDK 呼び出しを静的解析で検出
   - 使用しているアクションに対応する IAM アクションを正確にマッピング

2. **KMS 権限の自動付与**

   - 暗号化されたリソースへのアクセスに必要な KMS 権限を自動検出
   - `kms:ViaService` 条件を適切に設定

3. **関連アクションの包括的な提案**

   - 例: `InvokeModelCommand` に対して `bedrock:InvokeModel` だけでなく、`bedrock:CallWithBearerToken`, `bedrock:ApplyGuardrail` も提案
   - 例: `GetObjectCommand` に対して `s3:GetObject` だけでなく、`s3:GetObjectLegalHold`, `s3:GetObjectRetention`, `s3-object-lambda:GetObject` も提案

4. **最小権限の原則**
   - 実際に使用しているアクションのみを許可するポリシーを生成
   - 例: DynamoDB で `PutCommand` のみ使用 → `dynamodb:PutItem` のみ提案（`UpdateItem`, `BatchWriteItem` は含まない）

### 制限事項

1. **イベントソースマッピングの権限は検出不可**

   - SQS、Kinesis、DynamoDB Streams などのイベントソースマッピングで必要な権限は、Lambda コード内で SDK を呼び出していないため検出できない
   - これらの権限は CDK の `addEventSource()` や `SqsEventSource` が内部で自動付与する

2. **静的解析の限界**

   - 動的に決定される SDK 呼び出し（例: 変数に基づくサービス選択）は検出が困難な可能性
   - 条件分岐内の SDK 呼び出しは検出されるが、実行時に呼ばれない可能性がある

3. **リソース ARN の汎用性**
   - 生成されるポリシーのリソース ARN はワイルドカード（`*`）を含む汎用的な形式
   - 本番環境では特定のリソース ARN に絞り込む必要がある

---

## 実装への影響

### CDK での対応方針

| ケース                   | IAM Policy Autopilot | CDK での対応                                       |
| ------------------------ | -------------------- | -------------------------------------------------- |
| SDK 直接呼び出し         | ✅ 検出可能          | 生成されたポリシーを `addToRolePolicy()` で適用    |
| イベントソースマッピング | ❌ 検出不可          | CDK の `addEventSource()` が自動付与（grant 方式） |
| KMS 暗号化               | ✅ 検出可能          | 生成されたポリシーに含まれる                       |

### 実装状況サマリー

| 環境   | Lambda                    | IAM Policy Autopilot 準拠                    |
| ------ | ------------------------- | -------------------------------------------- |
| 環境 1 | simple-s3-reader          | ✅ 完全準拠                                  |
| 環境 2 | sqs-dynamodb-processor    | ✅ 完全準拠（DynamoDB）/ CDK 自動付与（SQS） |
| 環境 3 | complex-bedrock-processor | ✅ 完全準拠                                  |

### 変更履歴

`IAMPermissionConstruct` を以下のように修正：

- **変更前:** CDK の `grant*()` メソッドを使用
- **変更後:** IAM Policy Autopilot で生成されたポリシーに基づく明示的な `iam.PolicyStatement` を使用

#### S3 読み取り権限

```typescript
// 変更前
s3Bucket.grantRead(lambdaFunction);

// 変更後（IAM Policy Autopilot 提案準拠）
actions: [
  "s3:GetObject",
  "s3:GetObjectLegalHold",
  "s3:GetObjectRetention",
  "s3:GetObjectTagging",
  "s3:GetObjectVersion",
];
actions: ["s3-object-lambda:GetObject"];
```

#### S3 書き込み権限

```typescript
// 変更前
s3Bucket.grantWrite(lambdaFunction);

// 変更後（IAM Policy Autopilot 提案準拠）
actions: [
  "s3:PutObject",
  "s3:PutObjectAcl",
  "s3:PutObjectLegalHold",
  "s3:PutObjectRetention",
  "s3:PutObjectTagging",
];
actions: ["s3-object-lambda:PutObject"];
```

#### DynamoDB 書き込み権限

```typescript
// 変更前
dynamoDBTable.grantWriteData(lambdaFunction);

// 変更後（IAM Policy Autopilot 提案準拠）
actions: ["dynamodb:PutItem"];
```

#### Bedrock 呼び出し権限

```typescript
// 変更前
actions: ["bedrock:InvokeModel"];
resources: [`arn:aws:bedrock:*::foundation-model/${bedrockModelId}`];

// 変更後（IAM Policy Autopilot 提案準拠）
actions: ["bedrock:ApplyGuardrail"];
resources: [
  "arn:aws:bedrock:*:*:guardrail-profile/*",
  "arn:aws:bedrock:*:*:guardrail/*",
];

actions: ["bedrock:CallWithBearerToken", "bedrock:InvokeModel"];
resources: ["*"];
```

---

## 結論

IAM Policy Autopilot は Lambda コードの静的解析に基づいて IAM ポリシーを生成するツールであり、SDK 呼び出しに対応する権限を正確に検出できる。ただし、イベントソースマッピングのような「コード外」で必要となる権限は検出範囲外となる。

CDK を使用する場合、以下のハイブリッドアプローチが推奨される：

1. **SDK 呼び出しの権限:** IAM Policy Autopilot で生成 → 明示的ポリシーとして適用
2. **イベントソースの権限:** CDK の組み込み機能（`addEventSource()` 等）に委譲

---

## 疎通テスト結果

### SimpleIamTestStack（simple-s3-reader）

**テスト日時:** 2025-12-23T03:50:53.799Z

**テスト方法:**

```bash
aws lambda invoke --function-name "SimpleIamTestStack-LambdaFunction9BE3F601-FsIlxZ7mXSHT" --payload '{}' --cli-binary-format raw-in-base64-out /tmp/simple-lambda-response.json
```

**結果:** ✅ 成功

**レスポンス:**

```json
{
  "statusCode": 200,
  "body": {
    "message": "ファイル読み込み成功",
    "fileName": "sample.json",
    "bucketName": "simpleiamteststack-s3storagebucketcf59ebf7-dbvjjuuolfwc",
    "contentLength": 165,
    "timestamp": "2025-12-23T03:50:53.799Z"
  }
}
```

**確認事項:**

- S3 バケットからの `GetObject` 操作が正常に動作
- IAM Policy Autopilot で生成したポリシーが適切に機能している

---

### StandardIamTestStack（sqs-dynamodb-processor）

**テスト日時:** 2025-12-23T03:52:57.838Z

**テスト方法:**

```bash
# SQS にテストメッセージを送信
aws sqs send-message --queue-url "https://sqs.ap-northeast-1.amazonaws.com/602089200513/StandardIamTestStack-SQSQueue082E81F7-Qu52XqnUQ6ya" --message-body '{"testId": "test-001", "message": "疎通テスト", "timestamp": "2025-12-23T04:00:00Z"}'
```

**結果:** ✅ 成功

**Lambda 実行ログ:**

```
INFO  SQS イベント受信 recordCount: 1
INFO  メッセージ処理成功: ce687541-835e-415c-9767-fe2332ca3e97
INFO  バッチ処理完了 successCount: 1, failureCount: 0
```

**DynamoDB 書き込み確認:**

```json
{
  "messageId": "ce687541-835e-415c-9767-fe2332ca3e97",
  "body": "{\"testId\": \"test-001\", \"message\": \"疎通テスト\", \"timestamp\": \"2025-12-23T04:00:00Z\"}",
  "status": "processed",
  "processedAt": "2025-12-23T03:52:57.838Z",
  "sourceQueue": "StandardIamTestStack-SQSQueue082E81F7-Qu52XqnUQ6ya"
}
```

**確認事項:**

- SQS イベントソースマッピングが正常に動作（CDK 自動付与の権限）
- DynamoDB への `PutItem` 操作が正常に動作（IAM Policy Autopilot 生成ポリシー）
- 権限エラーなし

---

### ComplexIamTestStack（complex-bedrock-processor）

**テスト日時:** 2025-12-23T03:58:42.080Z

**テスト方法:**

```bash
aws lambda invoke --function-name "ComplexIamTestStack-LambdaFunction9BE3F601-2abuqNgpHI1x" --payload '{"inputText": "Hello, this is a test for Amazon Nova Lite model."}' --cli-binary-format raw-in-base64-out /tmp/complex-lambda-response.json
```

**結果:** ✅ 成功

**レスポンス:**

```json
{
  "statusCode": 200,
  "body": {
    "message": "処理が正常に完了しました",
    "processingId": "296bec8c-7f69-48ac-885e-176d8f90d8dd",
    "result": {
      "inputText": "Hello, this is a test for Amazon Nova Lite model.",
      "bedrockResponse": "このテキストは、Amazon Nova Liteモデルのテスト用のものだということを示しています。",
      "s3Location": "s3://complexiamteststack-s3storagebucketcf59ebf7-jmehhmcmzis0/processing-results/2025-12-23/296bec8c-7f69-48ac-885e-176d8f90d8dd.json",
      "eventId": "9df2e1a3-0f7b-5459-3f89-c132505542b9",
      "webhookUrl": "https://example.com/webhook",
      "timestamp": "2025-12-23T03:58:42.080Z"
    }
  }
}
```

**処理フロー確認:**

| ステップ | 処理内容                             | 結果    |
| -------- | ------------------------------------ | ------- |
| 1/4      | Secrets Manager からシークレット取得 | ✅ 成功 |
| 2/4      | Bedrock でテキスト処理               | ✅ 成功 |
| 3/4      | S3 に結果保存                        | ✅ 成功 |
| 4/4      | EventBridge にイベント送信           | ✅ 成功 |

**IAM 権限の検証結果:**

| AWS サービス    | 操作             | 結果                      |
| --------------- | ---------------- | ------------------------- |
| Secrets Manager | `GetSecretValue` | ✅ 成功（KMS 復号含む）   |
| Bedrock         | `InvokeModel`    | ✅ 成功（Nova Lite 使用） |
| S3              | `PutObject`      | ✅ 成功（KMS 暗号化含む） |
| EventBridge     | `PutEvents`      | ✅ 成功                   |

**備考:**

- 使用モデル: `amazon.nova-lite-v1:0`（オンデマンド課金）
- 初回テスト時は Claude 3 Sonnet で Inference Profile 必須エラーが発生したため、Nova Lite に変更

---

## 検証日時

2025 年 12 月 23 日
