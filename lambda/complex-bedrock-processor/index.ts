/**
 * Complex Bedrock Processor Lambda 関数
 *
 * Bedrock、S3、Secrets Manager、EventBridge を統合する Lambda 関数です。
 * 要件: 1.1, 1.2, 1.3, 1.4, 1.5, 2.4, 2.5, 3.3, 3.4, 4.2, 4.3, 6.3
 */

import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";
import {
  EventBridgeClient,
  PutEventsCommand,
} from "@aws-sdk/client-eventbridge";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";
import type { Handler } from "aws-lambda";
import { randomUUID } from "crypto";

// 環境変数
const BUCKET_NAME = process.env.BUCKET_NAME;
const SECRET_ARN = process.env.SECRET_ARN;
const EVENT_BUS_NAME = process.env.EVENT_BUS_NAME;
const BEDROCK_MODEL_ID =
  process.env.BEDROCK_MODEL_ID || "anthropic.claude-3-sonnet-20240229-v1:0";
const AWS_REGION = process.env.AWS_REGION || "us-east-1";

// AWS SDK クライアントの初期化
const bedrockClient = new BedrockRuntimeClient({ region: AWS_REGION });
const s3Client = new S3Client({ region: AWS_REGION });
const secretsClient = new SecretsManagerClient({ region: AWS_REGION });
const eventBridgeClient = new EventBridgeClient({ region: AWS_REGION });

/**
 * 処理結果のインターフェース
 */
interface ProcessingResult {
  inputText: string;
  bedrockResponse: string;
  s3Location: string;
  eventId: string;
  webhookUrl: string;
  timestamp: string;
}

/**
 * Lambda イベントのインターフェース
 */
interface LambdaEvent {
  inputText?: string;
}

/**
 * Bedrock レスポンスのインターフェース
 */
interface BedrockResponse {
  content: Array<{ type: string; text: string }>;
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
}

/**
 * Secrets Manager から webhook URL を取得する
 * 要件: 3.3, 3.4 - KMS 復号化は透明に処理される
 *
 * @returns webhook URL
 */
async function getWebhookUrl(): Promise<string> {
  if (!SECRET_ARN) {
    throw new Error("SECRET_ARN 環境変数が設定されていません");
  }

  console.log("Secrets Manager からシークレットを取得中...");

  try {
    const command = new GetSecretValueCommand({
      SecretId: SECRET_ARN,
    });

    const response = await secretsClient.send(command);

    if (!response.SecretString) {
      throw new Error("シークレット値が空です");
    }

    const secretData = JSON.parse(response.SecretString);
    const webhookUrl = secretData.webhookUrl;

    if (!webhookUrl) {
      throw new Error("シークレットに webhookUrl が含まれていません");
    }

    console.log("Secrets Manager からシークレットを正常に取得しました");
    return webhookUrl;
  } catch (error) {
    console.error("Secrets Manager エラー:", error);
    throw new Error(
      `シークレット取得に失敗しました: ${
        error instanceof Error ? error.message : "不明なエラー"
      }`
    );
  }
}

/**
 * Bedrock でテキスト処理を行う
 * 要件: 1.1, 1.2, 1.3 - Claude 3 Sonnet モデルを使用
 *
 * @param inputText 処理対象のテキスト
 * @returns Bedrock の処理結果
 */
async function processWithBedrock(inputText: string): Promise<{
  response: string;
  usage: { inputTokens: number; outputTokens: number };
}> {
  console.log("Bedrock でテキスト処理を開始...");
  console.log(`使用モデル: ${BEDROCK_MODEL_ID}`);

  try {
    // Claude 3 Sonnet 用のリクエストボディ
    const requestBody = {
      anthropic_version: "bedrock-2023-05-31",
      max_tokens: 1000,
      messages: [
        {
          role: "user",
          content: `以下のテキストを要約してください:\n\n${inputText}`,
        },
      ],
    };

    const command = new InvokeModelCommand({
      modelId: BEDROCK_MODEL_ID,
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify(requestBody),
    });

    const response = await bedrockClient.send(command);

    // レスポンスボディをパース
    const responseBody = JSON.parse(
      new TextDecoder().decode(response.body)
    ) as BedrockResponse;

    const responseText =
      responseBody.content?.[0]?.text || "レスポンスが空です";
    const usage = {
      inputTokens: responseBody.usage?.input_tokens || 0,
      outputTokens: responseBody.usage?.output_tokens || 0,
    };

    console.log("Bedrock 処理が正常に完了しました");
    console.log(
      `トークン使用量: 入力=${usage.inputTokens}, 出力=${usage.outputTokens}`
    );

    return { response: responseText, usage };
  } catch (error) {
    console.error("Bedrock エラー:", error);

    // 要件 1.5: Bedrock のスロットリングとエラーレスポンスを適切に処理
    if (error instanceof Error) {
      if (error.name === "ThrottlingException") {
        throw new Error(
          "Bedrock API 呼び出し制限を超過しました。しばらく待ってから再試行してください。"
        );
      }
      if (error.name === "ValidationException") {
        throw new Error(`Bedrock リクエストが無効です: ${error.message}`);
      }
      if (error.name === "ModelNotReadyException") {
        throw new Error(
          "Bedrock モデルが利用できません。しばらく待ってから再試行してください。"
        );
      }
      if (error.name === "AccessDeniedException") {
        throw new Error(
          "Bedrock へのアクセス権限がありません。IAM ポリシーを確認してください。"
        );
      }
    }

    throw new Error(
      `Bedrock 処理に失敗しました: ${
        error instanceof Error ? error.message : "不明なエラー"
      }`
    );
  }
}

/**
 * 処理結果を S3 に保存する
 * 要件: 1.4, 2.4, 2.5 - KMS 暗号化は透明に処理される
 *
 * @param processingId 処理 ID
 * @param data 保存するデータ
 * @returns S3 の保存場所
 */
async function saveToS3(
  processingId: string,
  data: {
    input: string;
    bedrockResponse: string;
    bedrockUsage: { inputTokens: number; outputTokens: number };
    webhookUrl: string;
  }
): Promise<string> {
  if (!BUCKET_NAME) {
    throw new Error("BUCKET_NAME 環境変数が設定されていません");
  }

  console.log("S3 に処理結果を保存中...");

  const timestamp = new Date().toISOString();
  const key = `processing-results/${
    timestamp.split("T")[0]
  }/${processingId}.json`;

  // 保存するデータの構造化
  const s3Data = {
    processingId,
    timestamp,
    input: {
      originalText: data.input,
      source: "lambda-invocation",
    },
    bedrock: {
      modelId: BEDROCK_MODEL_ID,
      response: data.bedrockResponse,
      usage: {
        inputTokens: data.bedrockUsage.inputTokens,
        outputTokens: data.bedrockUsage.outputTokens,
      },
    },
    webhook: {
      url: data.webhookUrl,
      retrieved: true,
    },
  };

  try {
    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: JSON.stringify(s3Data, null, 2),
      ContentType: "application/json",
    });

    await s3Client.send(command);

    const s3Location = `s3://${BUCKET_NAME}/${key}`;
    console.log(`S3 に正常に保存しました: ${s3Location}`);

    return s3Location;
  } catch (error) {
    console.error("S3 エラー:", error);

    // KMS 関連エラーの処理
    if (error instanceof Error) {
      if (error.name === "KMSKeyDisabledException") {
        throw new Error("S3 暗号化用の KMS キーが無効です");
      }
      if (
        error.name === "AccessDenied" ||
        error.name === "KMSAccessDeniedException"
      ) {
        throw new Error("S3 または KMS へのアクセス権限がありません");
      }
    }

    throw new Error(
      `S3 保存に失敗しました: ${
        error instanceof Error ? error.message : "不明なエラー"
      }`
    );
  }
}

/**
 * EventBridge にイベントを送信する
 * 要件: 4.2, 4.3 - カスタムイベントバスに処理結果を送信
 *
 * @param eventData イベントデータ
 * @returns イベント ID
 */
async function sendToEventBridge(eventData: {
  processingId: string;
  status: "success" | "error";
  s3Location?: string;
  bedrockResponse?: string;
  error?: string;
  executionTime: number;
}): Promise<string> {
  if (!EVENT_BUS_NAME) {
    throw new Error("EVENT_BUS_NAME 環境変数が設定されていません");
  }

  console.log("EventBridge にイベントを送信中...");

  try {
    const command = new PutEventsCommand({
      Entries: [
        {
          EventBusName: EVENT_BUS_NAME,
          Source: "complex-iam-test",
          DetailType: "AI Processing Completed",
          Detail: JSON.stringify({
            processingResult: {
              processingId: eventData.processingId,
              s3Location: eventData.s3Location || "",
              bedrockResponse: eventData.bedrockResponse || "",
              timestamp: new Date().toISOString(),
            },
            status: eventData.status,
            error: eventData.error,
            metadata: {
              executionTime: eventData.executionTime,
              region: AWS_REGION,
            },
          }),
        },
      ],
    });

    const response = await eventBridgeClient.send(command);

    // エラーチェック
    if (response.FailedEntryCount && response.FailedEntryCount > 0) {
      const failedEntry = response.Entries?.[0];
      throw new Error(
        `EventBridge イベント送信に失敗: ${failedEntry?.ErrorCode} - ${failedEntry?.ErrorMessage}`
      );
    }

    const eventId = response.Entries?.[0]?.EventId || "unknown";
    console.log(`EventBridge にイベントを正常に送信しました: ${eventId}`);

    return eventId;
  } catch (error) {
    console.error("EventBridge エラー:", error);

    // 要件 4.4: EventBridge API エラーを適切に処理
    if (error instanceof Error) {
      if (error.name === "ResourceNotFoundException") {
        throw new Error(
          `EventBridge バス '${EVENT_BUS_NAME}' が見つかりません`
        );
      }
    }

    throw new Error(
      `EventBridge 送信に失敗しました: ${
        error instanceof Error ? error.message : "不明なエラー"
      }`
    );
  }
}

/**
 * Lambda ハンドラー
 * 要件: 1.4, 6.3, 6.5 - エンドツーエンド処理と統合エラーハンドリング
 *
 * 処理フロー:
 * 1. Secrets Manager から webhook URL を取得
 * 2. Bedrock でテキスト処理
 * 3. 結果を S3 に保存（KMS 暗号化）
 * 4. EventBridge にイベント送信
 */
export const handler: Handler = async (event: LambdaEvent) => {
  const startTime = Date.now();
  const processingId = randomUUID();

  console.log("=".repeat(50));
  console.log("Lambda 関数が呼び出されました");
  console.log(`処理 ID: ${processingId}`);
  console.log("環境変数:", {
    BUCKET_NAME,
    SECRET_ARN: SECRET_ARN ? "設定済み" : "未設定",
    EVENT_BUS_NAME,
    BEDROCK_MODEL_ID,
    AWS_REGION,
  });
  console.log("イベント:", JSON.stringify(event, null, 2));
  console.log("=".repeat(50));

  // 入力テキストの取得
  const inputText = event.inputText || "これはテスト用のサンプルテキストです。";

  let webhookUrl: string = "";
  let bedrockResult: {
    response: string;
    usage: { inputTokens: number; outputTokens: number };
  };
  let s3Location: string = "";
  let eventId: string = "";

  try {
    // ステップ 1: Secrets Manager から webhook URL を取得
    console.log("\n[ステップ 1/4] Secrets Manager からシークレットを取得");
    webhookUrl = await getWebhookUrl();

    // ステップ 2: Bedrock でテキスト処理
    console.log("\n[ステップ 2/4] Bedrock でテキスト処理");
    bedrockResult = await processWithBedrock(inputText);

    // ステップ 3: S3 に結果を保存
    console.log("\n[ステップ 3/4] S3 に処理結果を保存");
    s3Location = await saveToS3(processingId, {
      input: inputText,
      bedrockResponse: bedrockResult.response,
      bedrockUsage: bedrockResult.usage,
      webhookUrl,
    });

    // ステップ 4: EventBridge にイベント送信
    console.log("\n[ステップ 4/4] EventBridge にイベントを送信");
    const executionTime = Date.now() - startTime;
    eventId = await sendToEventBridge({
      processingId,
      status: "success",
      s3Location,
      bedrockResponse: bedrockResult.response,
      executionTime,
    });

    // 成功レスポンス
    const result: ProcessingResult = {
      inputText,
      bedrockResponse: bedrockResult.response,
      s3Location,
      eventId,
      webhookUrl,
      timestamp: new Date().toISOString(),
    };

    console.log("\n" + "=".repeat(50));
    console.log("処理が正常に完了しました");
    console.log(`処理時間: ${Date.now() - startTime}ms`);
    console.log("=".repeat(50));

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "処理が正常に完了しました",
        processingId,
        result,
      }),
    };
  } catch (error) {
    // 要件 6.3: 統合エラーハンドリング
    console.error("\n" + "=".repeat(50));
    console.error("処理中にエラーが発生しました:", error);
    console.error("=".repeat(50));

    // エラー時も EventBridge にイベントを送信（可能な場合）
    try {
      const executionTime = Date.now() - startTime;
      await sendToEventBridge({
        processingId,
        status: "error",
        error: error instanceof Error ? error.message : "不明なエラー",
        executionTime,
      });
      console.log("エラーイベントを EventBridge に送信しました");
    } catch (eventError) {
      console.error("エラーイベントの送信に失敗しました:", eventError);
    }

    // エラーレスポンス
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: "処理中にエラーが発生しました",
        processingId,
        error: error instanceof Error ? error.message : "不明なエラー",
        timestamp: new Date().toISOString(),
      }),
    };
  }
};
