import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as events from "aws-cdk-lib/aws-events";
import * as iam from "aws-cdk-lib/aws-iam";
import * as kms from "aws-cdk-lib/aws-kms";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as sqs from "aws-cdk-lib/aws-sqs";
import { Construct } from "constructs";

/**
 * IAMPermissionConstruct のプロパティインターフェース
 */
export interface IAMPermissionConstructProps {
  /** 権限を付与する Lambda 関数 */
  lambdaFunction: lambda.IFunction;

  /** アクセス対象の S3 バケット（オプション） */
  s3Bucket?: s3.IBucket;

  /** アクセス対象の SQS キュー（オプション） */
  sqsQueue?: sqs.IQueue;

  /** アクセス対象の DynamoDB テーブル（オプション） */
  dynamoDBTable?: dynamodb.ITable;

  /** アクセス対象の Secrets Manager シークレット（オプション） */
  secret?: secretsmanager.ISecret;

  /** アクセス対象の EventBridge イベントバス（オプション） */
  eventBus?: events.IEventBus;

  /** アクセス対象の KMS キー（オプション） */
  kmsKey?: kms.IKey;

  /** Bedrock モデル ID（オプション、指定時に Bedrock 権限を付与） */
  bedrockModelId?: string;

  /** 付与する権限の種類（デフォルト: ["read"]） */
  permissions?: ("read" | "write" | "delete" | "consume" | "send" | "invoke")[];
}

/**
 * Lambda 関数と各種 AWS リソース間の IAM 権限設定を管理する再利用可能なコンストラクト
 *
 * このコンストラクトは以下の責任を持ちます：
 * - Lambda 関数と S3 バケット間の IAM 権限設定の管理
 * - Lambda 関数と SQS キュー間の IAM 権限設定の管理
 * - Lambda 関数と DynamoDB テーブル間の IAM 権限設定の管理
 * - Lambda 関数と Secrets Manager 間の IAM 権限設定の管理
 * - Lambda 関数と EventBridge 間の IAM 権限設定の管理
 * - Lambda 関数と KMS キー間の IAM 権限設定の管理
 * - Lambda 関数と Bedrock 間の IAM 権限設定の管理
 * - 最小権限の原則に従った権限付与
 * - CDK の標準 Grant メソッドを使用した権限設定
 * - 権限の種類に応じた適切な IAM ポリシーの生成
 */
export class IAMPermissionConstruct extends Construct {
  constructor(
    scope: Construct,
    id: string,
    props: IAMPermissionConstructProps
  ) {
    super(scope, id);

    // 必須プロパティの検証
    if (!props.lambdaFunction) {
      throw new Error("lambdaFunction は必須プロパティです");
    }

    // デフォルト値の設定（最小権限の原則に従い、読み取りのみをデフォルトとする）
    const {
      lambdaFunction,
      s3Bucket,
      sqsQueue,
      dynamoDBTable,
      secret,
      eventBus,
      kmsKey,
      bedrockModelId,
      permissions = ["read"],
    } = props;

    // S3 バケットの権限設定
    if (s3Bucket) {
      permissions.forEach((permission) => {
        switch (permission) {
          case "read":
            // S3 バケットからの読み取り権限を付与
            s3Bucket.grantRead(lambdaFunction);
            break;

          case "write":
            // S3 バケットへの書き込み権限を付与
            s3Bucket.grantWrite(lambdaFunction);
            break;

          case "delete":
            // S3 バケットからの削除権限を付与
            s3Bucket.grantDelete(lambdaFunction);
            break;
        }
      });
    }

    // SQS キューの権限設定
    if (sqsQueue) {
      permissions.forEach((permission) => {
        switch (permission) {
          case "consume":
            // SQS キューからのメッセージ受信・削除権限を付与
            sqsQueue.grantConsumeMessages(lambdaFunction);
            break;

          case "send":
            // SQS キューへのメッセージ送信権限を付与
            sqsQueue.grantSendMessages(lambdaFunction);
            break;
        }
      });
    }

    // DynamoDB テーブルの権限設定
    if (dynamoDBTable) {
      permissions.forEach((permission) => {
        switch (permission) {
          case "read":
            // DynamoDB テーブルからの読み取り権限を付与
            dynamoDBTable.grantReadData(lambdaFunction);
            break;

          case "write":
            // DynamoDB テーブルへの書き込み権限を付与
            dynamoDBTable.grantWriteData(lambdaFunction);
            break;
        }
      });
    }

    // Secrets Manager の権限設定
    if (secret) {
      permissions.forEach((permission) => {
        switch (permission) {
          case "read":
            // シークレットの読み取り権限を付与（KMS 復号化権限も含む）
            secret.grantRead(lambdaFunction);
            break;

          case "write":
            // シークレットの書き込み権限を付与
            secret.grantWrite(lambdaFunction);
            break;
        }
      });
    }

    // EventBridge の権限設定
    if (eventBus) {
      permissions.forEach((permission) => {
        switch (permission) {
          case "send":
            // イベント送信権限を付与
            eventBus.grantPutEventsTo(lambdaFunction);
            break;
        }
      });
    }

    // KMS キーの権限設定
    if (kmsKey) {
      permissions.forEach((permission) => {
        switch (permission) {
          case "read":
            // KMS 復号化権限を付与
            kmsKey.grantDecrypt(lambdaFunction);
            break;

          case "write":
            // KMS 暗号化権限を付与
            kmsKey.grantEncrypt(lambdaFunction);
            break;
        }
      });
    }

    // Bedrock の権限設定
    if (bedrockModelId) {
      permissions.forEach((permission) => {
        switch (permission) {
          case "invoke":
            // Bedrock モデル呼び出し権限を付与
            lambdaFunction.addToRolePolicy(
              new iam.PolicyStatement({
                effect: iam.Effect.ALLOW,
                actions: [
                  "bedrock:InvokeModel",
                  "bedrock:InvokeModelWithResponseStream",
                ],
                resources: [
                  `arn:aws:bedrock:*::foundation-model/${bedrockModelId}`,
                ],
              })
            );
            break;
        }
      });
    }
  }

  /**
   * 読み取り権限を追加で付与する
   * @param lambdaFunction 権限を付与する Lambda 関数
   * @param s3Bucket アクセス対象の S3 バケット
   */
  public static grantRead(
    lambdaFunction: lambda.IFunction,
    s3Bucket: s3.IBucket
  ): void {
    s3Bucket.grantRead(lambdaFunction);
  }

  /**
   * 書き込み権限を追加で付与する
   * @param lambdaFunction 権限を付与する Lambda 関数
   * @param s3Bucket アクセス対象の S3 バケット
   */
  public static grantWrite(
    lambdaFunction: lambda.IFunction,
    s3Bucket: s3.IBucket
  ): void {
    s3Bucket.grantWrite(lambdaFunction);
  }

  /**
   * 削除権限を追加で付与する
   * @param lambdaFunction 権限を付与する Lambda 関数
   * @param s3Bucket アクセス対象の S3 バケット
   */
  public static grantDelete(
    lambdaFunction: lambda.IFunction,
    s3Bucket: s3.IBucket
  ): void {
    s3Bucket.grantDelete(lambdaFunction);
  }

  /**
   * 読み書き権限を追加で付与する
   * @param lambdaFunction 権限を付与する Lambda 関数
   * @param s3Bucket アクセス対象の S3 バケット
   */
  public static grantReadWrite(
    lambdaFunction: lambda.IFunction,
    s3Bucket: s3.IBucket
  ): void {
    s3Bucket.grantReadWrite(lambdaFunction);
  }
}
