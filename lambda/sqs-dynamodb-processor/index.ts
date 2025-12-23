import {
  ConditionalCheckFailedException,
  DynamoDBClient,
  ProvisionedThroughputExceededException,
  ResourceNotFoundException,
} from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import type {
  SQSBatchItemFailure,
  SQSBatchResponse,
  SQSEvent,
  SQSRecord,
} from "aws-lambda";

// DynamoDB クライアントの初期化
const dynamoDBClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoDBClient);

// 環境変数からテーブル名を取得
const TABLE_NAME = process.env.TABLE_NAME || "";

/**
 * 処理済みメッセージのインターフェース
 * DynamoDB に保存されるアイテムの形式
 */
export interface ProcessedMessage {
  messageId: string;
  timestamp: string;
  body: string;
  sourceQueue: string;
  processedAt: string;
  status: string;
}

/**
 * エラータイプの列挙
 * エラーハンドリングで使用する分類
 */
export enum ErrorType {
  DYNAMODB_CONDITIONAL_CHECK = "DYNAMODB_CONDITIONAL_CHECK",
  DYNAMODB_THROUGHPUT_EXCEEDED = "DYNAMODB_THROUGHPUT_EXCEEDED",
  DYNAMODB_RESOURCE_NOT_FOUND = "DYNAMODB_RESOURCE_NOT_FOUND",
  DYNAMODB_UNKNOWN = "DYNAMODB_UNKNOWN",
  MESSAGE_PROCESSING = "MESSAGE_PROCESSING",
  UNKNOWN = "UNKNOWN",
}

/**
 * エラーを分類して適切なエラータイプを返す
 *
 * @param error - 発生したエラー
 * @returns エラータイプ
 */
export function classifyError(error: unknown): ErrorType {
  if (error instanceof ConditionalCheckFailedException) {
    return ErrorType.DYNAMODB_CONDITIONAL_CHECK;
  }
  if (error instanceof ProvisionedThroughputExceededException) {
    return ErrorType.DYNAMODB_THROUGHPUT_EXCEEDED;
  }
  if (error instanceof ResourceNotFoundException) {
    return ErrorType.DYNAMODB_RESOURCE_NOT_FOUND;
  }
  if (error instanceof Error && error.name.startsWith("DynamoDB")) {
    return ErrorType.DYNAMODB_UNKNOWN;
  }
  return ErrorType.UNKNOWN;
}

/**
 * SQS レコードからメッセージ内容を抽出して ProcessedMessage に変換する
 *
 * @param record - SQS レコード
 * @returns 処理済みメッセージ
 */
export function extractMessage(record: SQSRecord): ProcessedMessage {
  // タイムスタンプの抽出（SentTimestamp が存在しない場合は現在時刻を使用）
  const sentTimestamp = record.attributes?.SentTimestamp;
  const timestamp = sentTimestamp
    ? new Date(parseInt(sentTimestamp)).toISOString()
    : new Date().toISOString();

  // ソースキュー名の抽出（ARN から最後の部分を取得）
  const sourceQueue = record.eventSourceARN?.split(":").pop() || "unknown";

  return {
    messageId: record.messageId,
    timestamp,
    body: record.body,
    sourceQueue,
    processedAt: new Date().toISOString(),
    status: "processed",
  };
}

/**
 * 単一のメッセージを処理して DynamoDB に保存する
 *
 * @param record - SQS レコード
 * @throws エラーが発生した場合は再スロー
 */
export async function processMessage(record: SQSRecord): Promise<void> {
  // メッセージ内容の抽出
  const processedMessage = extractMessage(record);

  // DynamoDB に保存
  await docClient.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: processedMessage,
    })
  );

  console.log(`メッセージ処理成功: ${record.messageId}`);
}

/**
 * エラーをログに記録する
 *
 * @param messageId - メッセージID
 * @param error - 発生したエラー
 * @param errorType - エラータイプ
 */
function logError(
  messageId: string,
  error: unknown,
  errorType: ErrorType
): void {
  const errorMessage = error instanceof Error ? error.message : String(error);

  console.error(
    JSON.stringify({
      level: "ERROR",
      messageId,
      errorType,
      errorMessage,
      timestamp: new Date().toISOString(),
    })
  );
}

/**
 * SQS イベントハンドラー
 * SQS メッセージを受信して DynamoDB に保存する
 * 部分的失敗レポートをサポートし、失敗したメッセージのみ再処理される
 *
 * @param event - SQS イベント
 * @returns SQS バッチレスポンス（部分的失敗をサポート）
 */
export const handler = async (event: SQSEvent): Promise<SQSBatchResponse> => {
  console.log(
    JSON.stringify({
      level: "INFO",
      message: "SQS イベント受信",
      recordCount: event.Records.length,
      timestamp: new Date().toISOString(),
    })
  );

  const batchItemFailures: SQSBatchItemFailure[] = [];

  // 各メッセージを並列処理
  const processPromises = event.Records.map(async (record) => {
    try {
      await processMessage(record);
    } catch (error) {
      // エラーを分類してログに記録
      const errorType = classifyError(error);
      logError(record.messageId, error, errorType);

      // 失敗したメッセージを記録（部分的失敗レポート用）
      // これにより、失敗したメッセージのみが SQS に残り、再処理または DLQ に移動される
      batchItemFailures.push({
        itemIdentifier: record.messageId,
      });
    }
  });

  // すべてのメッセージ処理を待機
  await Promise.all(processPromises);

  const successCount = event.Records.length - batchItemFailures.length;
  const failureCount = batchItemFailures.length;

  console.log(
    JSON.stringify({
      level: "INFO",
      message: "バッチ処理完了",
      successCount,
      failureCount,
      timestamp: new Date().toISOString(),
    })
  );

  // 部分的失敗レスポンスを返す
  // batchItemFailures に含まれるメッセージは SQS に残り、再処理される
  return {
    batchItemFailures,
  };
};
