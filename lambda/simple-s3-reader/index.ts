import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { Readable } from "node:stream";

// Lambda関数のイベント型定義
interface LambdaEvent {
  [key: string]: unknown;
}

// Lambda関数のレスポンス型定義
interface LambdaResponse {
  statusCode: number;
  body: string;
  headers?: Record<string, string>;
}

// S3エラー型定義
interface S3Error extends Error {
  name: string;
  code?: string;
  $metadata?: Record<string, unknown>;
}

// S3クライアントの初期化
const s3Client = new S3Client({});

/**
 * Lambda関数のメインハンドラー
 * S3バケットからJSONファイルを読み込み、内容をコンソールに出力する
 */
export const handler = async (event: LambdaEvent): Promise<LambdaResponse> => {
  console.log("Lambda関数が開始されました");
  console.log("受信イベント:", JSON.stringify(event, null, 2));

  // 環境変数からバケット名を取得
  const bucketName = process.env.BUCKET_NAME;
  const fileName = process.env.FILE_NAME || "sample.json";

  if (!bucketName) {
    const errorMessage = "BUCKET_NAME環境変数が設定されていません";
    console.error("設定エラー:", errorMessage);
    console.error(
      "利用可能な環境変数:",
      Object.keys(process.env).filter((key) => key.startsWith("BUCKET"))
    );
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "ConfigurationError",
        message: errorMessage,
      }),
    };
  }

  // 入力値の検証
  if (!fileName || fileName.trim() === "") {
    const errorMessage = "ファイル名が無効です";
    console.error("入力検証エラー:", errorMessage);
    return {
      statusCode: 400,
      body: JSON.stringify({
        error: "InvalidInput",
        message: errorMessage,
      }),
    };
  }

  console.log(`S3バケット: ${bucketName}`);
  console.log(`読み込みファイル: ${fileName}`);

  try {
    // S3からファイルを読み込む
    const getObjectCommand = new GetObjectCommand({
      Bucket: bucketName,
      Key: fileName,
    });

    console.log("S3からファイルを読み込み中...");
    const startTime = Date.now();
    const response = await s3Client.send(getObjectCommand);
    const endTime = Date.now();

    console.log(`S3読み込み完了 (${endTime - startTime}ms)`);
    console.log("レスポンスメタデータ:", {
      contentType: response.ContentType,
      contentLength: response.ContentLength,
      lastModified: response.LastModified,
      etag: response.ETag,
    });

    // レスポンスボディをストリームから文字列に変換
    const bodyContents = await streamToString(response.Body as Readable);

    console.log("ファイル読み込み成功");
    console.log(`ファイルサイズ: ${bodyContents.length} バイト`);
    console.log("ファイル内容:", bodyContents);

    // JSONとしてパースして構造化された形で出力
    try {
      const jsonData = JSON.parse(bodyContents);
      console.log("パース済みJSONデータ:", JSON.stringify(jsonData, null, 2));

      // JSON構造の基本検証
      if (typeof jsonData === "object" && jsonData !== null) {
        console.log("有効なJSONオブジェクトを検出しました");
        console.log("JSONキー数:", Object.keys(jsonData).length);
      }
    } catch (parseError) {
      console.warn(
        "JSONパースに失敗しましたが、ファイル内容は正常に読み込まれました"
      );
      console.warn("パースエラー詳細:", parseError);
      console.warn(
        "ファイル内容の最初の100文字:",
        bodyContents.substring(0, 100)
      );
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "ファイル読み込み成功",
        fileName: fileName,
        bucketName: bucketName,
        contentLength: bodyContents.length,
        timestamp: new Date().toISOString(),
      }),
    };
  } catch (error: unknown) {
    const s3Error = error as S3Error;
    console.error("S3ファイル読み込みエラー:", s3Error);

    // エラーの詳細情報をログに記録
    console.error("エラー発生時刻:", new Date().toISOString());
    console.error("対象バケット:", bucketName);
    console.error("対象ファイル:", fileName);

    if (s3Error.name) {
      console.error("エラー名:", s3Error.name);
    }
    if (s3Error.message) {
      console.error("エラーメッセージ:", s3Error.message);
    }
    if (s3Error.code) {
      console.error("エラーコード:", s3Error.code);
    }
    if (s3Error.stack) {
      console.error("スタックトレース:", s3Error.stack);
    }
    if (s3Error.$metadata) {
      console.error(
        "AWS メタデータ:",
        JSON.stringify(s3Error.$metadata, null, 2)
      );
    }

    // 特定のS3エラーに対する詳細なハンドリング
    return handleS3Error(s3Error, bucketName, fileName);
  }
};

/**
 * ストリームを文字列に変換するヘルパー関数
 */
async function streamToString(stream: Readable | undefined): Promise<string> {
  if (!stream) {
    const errorMessage = "ストリームが空です";
    console.error("ストリームエラー:", errorMessage);
    throw new Error(errorMessage);
  }

  const chunks: Uint8Array[] = [];

  return new Promise((resolve, reject) => {
    stream.on("data", (chunk: Uint8Array) => {
      chunks.push(chunk);
    });

    stream.on("error", (error) => {
      console.error("ストリーム読み込みエラー:", error);
      reject(error);
    });

    stream.on("end", () => {
      try {
        const buffer = Buffer.concat(chunks);
        const result = buffer.toString("utf-8");
        console.log(`ストリーム読み込み完了: ${result.length} バイト`);
        resolve(result);
      } catch (error) {
        console.error("バッファ変換エラー:", error);
        reject(error);
      }
    });

    // タイムアウト処理（30秒）
    const timeout = setTimeout(() => {
      const timeoutError = new Error("ストリーム読み込みタイムアウト（30秒）");
      console.error("タイムアウトエラー:", timeoutError.message);
      reject(timeoutError);
    }, 30000);

    stream.on("end", () => clearTimeout(timeout));
    stream.on("error", () => clearTimeout(timeout));
  });
}

/**
 * S3エラーを適切にハンドリングし、適切なレスポンスを返す
 */
function handleS3Error(
  error: S3Error,
  bucketName: string,
  fileName: string
): LambdaResponse {
  const errorName = error.name || error.code || "UnknownError";
  const timestamp = new Date().toISOString();

  switch (errorName) {
    case "NoSuchKey": {
      const noSuchKeyMessage = `指定されたファイルが見つかりません: ${fileName} (バケット: ${bucketName})`;
      console.error("NoSuchKeyエラー:", noSuchKeyMessage);
      console.error("推奨対応: ファイル名とパスを確認してください");
      return {
        statusCode: 404,
        body: JSON.stringify({
          error: "FileNotFound",
          message: noSuchKeyMessage,
          bucketName: bucketName,
          fileName: fileName,
          timestamp: timestamp,
          suggestion: "ファイル名とパスを確認してください",
        }),
      };
    }

    case "AccessDenied": {
      const accessDeniedMessage = `S3バケットへのアクセス権限がありません: ${bucketName}`;
      console.error("AccessDeniedエラー:", accessDeniedMessage);
      console.error("推奨対応: IAM権限を確認してください");
      return {
        statusCode: 403,
        body: JSON.stringify({
          error: "AccessDenied",
          message: accessDeniedMessage,
          bucketName: bucketName,
          fileName: fileName,
          timestamp: timestamp,
          suggestion: "IAM権限（s3:GetObject）を確認してください",
        }),
      };
    }

    case "NoSuchBucket": {
      const noSuchBucketMessage = `指定されたS3バケットが存在しません: ${bucketName}`;
      console.error("NoSuchBucketエラー:", noSuchBucketMessage);
      console.error("推奨対応: バケット名を確認してください");
      return {
        statusCode: 404,
        body: JSON.stringify({
          error: "BucketNotFound",
          message: noSuchBucketMessage,
          bucketName: bucketName,
          timestamp: timestamp,
          suggestion: "バケット名とリージョンを確認してください",
        }),
      };
    }

    case "InvalidBucketName": {
      const invalidBucketMessage = `無効なバケット名です: ${bucketName}`;
      console.error("InvalidBucketNameエラー:", invalidBucketMessage);
      console.error("推奨対応: バケット名の形式を確認してください");
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: "InvalidBucketName",
          message: invalidBucketMessage,
          bucketName: bucketName,
          timestamp: timestamp,
          suggestion: "バケット名は小文字、数字、ハイフンのみ使用可能です",
        }),
      };
    }

    case "NetworkingError":
    case "TimeoutError": {
      const networkMessage = `ネットワークエラーまたはタイムアウトが発生しました`;
      console.error("ネットワークエラー:", networkMessage, error);
      console.error("推奨対応: しばらく待ってから再試行してください");
      return {
        statusCode: 503,
        body: JSON.stringify({
          error: "NetworkError",
          message: networkMessage,
          canRetry: true,
          timestamp: timestamp,
          suggestion: "しばらく待ってから再試行してください",
        }),
      };
    }

    case "ThrottlingException":
    case "RequestLimitExceeded": {
      const throttleMessage = `リクエスト制限に達しました`;
      console.error("スロットリングエラー:", throttleMessage, error);
      console.error("推奨対応: リクエスト頻度を下げて再試行してください");
      return {
        statusCode: 429,
        body: JSON.stringify({
          error: "ThrottlingError",
          message: throttleMessage,
          canRetry: true,
          timestamp: timestamp,
          suggestion: "リクエスト頻度を下げて再試行してください",
        }),
      };
    }

    default: {
      const unexpectedMessage = `予期しないエラーが発生しました: ${
        error.message || errorName
      }`;
      console.error("予期しないエラー:", unexpectedMessage, error);
      console.error("エラーの詳細情報:", {
        name: error.name,
        code: error.code,
        message: error.message,
        stack: error.stack?.substring(0, 500), // スタックトレースの最初の500文字のみ
      });
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: "InternalError",
          message: unexpectedMessage,
          errorType: errorName,
          timestamp: timestamp,
          suggestion: "システム管理者に連絡してください",
        }),
      };
    }
  }
}
