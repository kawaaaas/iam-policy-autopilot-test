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
 * - IAM Policy Autopilot で生成された明示的なポリシーステートメントを使用
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

    // S3 バケットの権限設定（IAM Policy Autopilot 生成ポリシーベース）
    if (s3Bucket) {
      permissions.forEach((permission) => {
        switch (permission) {
          case "read":
            // S3 読み取り権限（IAM Policy Autopilot 生成）
            lambdaFunction.addToRolePolicy(
              new iam.PolicyStatement({
                effect: iam.Effect.ALLOW,
                actions: [
                  "s3:GetObject",
                  "s3:GetObjectLegalHold",
                  "s3:GetObjectRetention",
                  "s3:GetObjectTagging",
                  "s3:GetObjectVersion",
                ],
                resources: [`${s3Bucket.bucketArn}/*`],
              })
            );
            // S3 Object Lambda 読み取り権限（IAM Policy Autopilot 生成）
            lambdaFunction.addToRolePolicy(
              new iam.PolicyStatement({
                effect: iam.Effect.ALLOW,
                actions: ["s3-object-lambda:GetObject"],
                resources: [`${s3Bucket.bucketArn}/*`],
              })
            );
            // KMS 復号化権限（S3 経由）
            if (s3Bucket.encryptionKey) {
              lambdaFunction.addToRolePolicy(
                new iam.PolicyStatement({
                  effect: iam.Effect.ALLOW,
                  actions: ["kms:Decrypt"],
                  resources: [s3Bucket.encryptionKey.keyArn],
                  conditions: {
                    StringLike: {
                      "kms:ViaService": "s3.*.amazonaws.com",
                    },
                  },
                })
              );
            }
            break;

          case "write":
            // S3 書き込み権限（IAM Policy Autopilot 生成）
            lambdaFunction.addToRolePolicy(
              new iam.PolicyStatement({
                effect: iam.Effect.ALLOW,
                actions: [
                  "s3:PutObject",
                  "s3:PutObjectAcl",
                  "s3:PutObjectLegalHold",
                  "s3:PutObjectRetention",
                  "s3:PutObjectTagging",
                ],
                resources: [`${s3Bucket.bucketArn}/*`],
              })
            );
            // S3 Object Lambda 書き込み権限（IAM Policy Autopilot 生成）
            lambdaFunction.addToRolePolicy(
              new iam.PolicyStatement({
                effect: iam.Effect.ALLOW,
                actions: ["s3-object-lambda:PutObject"],
                resources: [`${s3Bucket.bucketArn}/*`],
              })
            );
            // KMS 暗号化権限（S3 経由）
            if (s3Bucket.encryptionKey) {
              lambdaFunction.addToRolePolicy(
                new iam.PolicyStatement({
                  effect: iam.Effect.ALLOW,
                  actions: ["kms:GenerateDataKey"],
                  resources: [s3Bucket.encryptionKey.keyArn],
                  conditions: {
                    StringLike: {
                      "kms:ViaService": "s3.*.amazonaws.com",
                    },
                  },
                })
              );
            }
            break;

          case "delete":
            // S3 削除権限
            lambdaFunction.addToRolePolicy(
              new iam.PolicyStatement({
                effect: iam.Effect.ALLOW,
                actions: ["s3:DeleteObject", "s3:DeleteObjectVersion"],
                resources: [`${s3Bucket.bucketArn}/*`],
              })
            );
            break;
        }
      });
    }

    // SQS キューの権限設定（IAM Policy Autopilot 生成ポリシーベース）
    if (sqsQueue) {
      permissions.forEach((permission) => {
        switch (permission) {
          case "consume":
            // SQS メッセージ受信権限
            lambdaFunction.addToRolePolicy(
              new iam.PolicyStatement({
                effect: iam.Effect.ALLOW,
                actions: [
                  "sqs:ReceiveMessage",
                  "sqs:DeleteMessage",
                  "sqs:GetQueueAttributes",
                  "sqs:ChangeMessageVisibility",
                ],
                resources: [sqsQueue.queueArn],
              })
            );
            // KMS 復号化権限（SQS 経由）
            if (sqsQueue.encryptionMasterKey) {
              lambdaFunction.addToRolePolicy(
                new iam.PolicyStatement({
                  effect: iam.Effect.ALLOW,
                  actions: ["kms:Decrypt"],
                  resources: [sqsQueue.encryptionMasterKey.keyArn],
                  conditions: {
                    StringLike: {
                      "kms:ViaService": "sqs.*.amazonaws.com",
                    },
                  },
                })
              );
            }
            break;

          case "send":
            // SQS メッセージ送信権限
            lambdaFunction.addToRolePolicy(
              new iam.PolicyStatement({
                effect: iam.Effect.ALLOW,
                actions: ["sqs:SendMessage", "sqs:GetQueueUrl"],
                resources: [sqsQueue.queueArn],
              })
            );
            break;
        }
      });
    }

    // DynamoDB テーブルの権限設定（IAM Policy Autopilot 生成ポリシーベース）
    if (dynamoDBTable) {
      permissions.forEach((permission) => {
        switch (permission) {
          case "read":
            // DynamoDB 読み取り権限
            lambdaFunction.addToRolePolicy(
              new iam.PolicyStatement({
                effect: iam.Effect.ALLOW,
                actions: [
                  "dynamodb:GetItem",
                  "dynamodb:Query",
                  "dynamodb:Scan",
                  "dynamodb:BatchGetItem",
                ],
                resources: [
                  dynamoDBTable.tableArn,
                  `${dynamoDBTable.tableArn}/index/*`,
                ],
              })
            );
            // KMS 復号化権限（DynamoDB 経由）
            if (dynamoDBTable.encryptionKey) {
              lambdaFunction.addToRolePolicy(
                new iam.PolicyStatement({
                  effect: iam.Effect.ALLOW,
                  actions: ["kms:Decrypt"],
                  resources: [dynamoDBTable.encryptionKey.keyArn],
                  conditions: {
                    StringLike: {
                      "kms:ViaService": "dynamodb.*.amazonaws.com",
                    },
                  },
                })
              );
            }
            break;

          case "write":
            // DynamoDB 書き込み権限（IAM Policy Autopilot 生成）
            lambdaFunction.addToRolePolicy(
              new iam.PolicyStatement({
                effect: iam.Effect.ALLOW,
                actions: ["dynamodb:PutItem"],
                resources: [dynamoDBTable.tableArn],
              })
            );
            // KMS 復号化権限（DynamoDB 経由）（IAM Policy Autopilot 生成）
            if (dynamoDBTable.encryptionKey) {
              lambdaFunction.addToRolePolicy(
                new iam.PolicyStatement({
                  effect: iam.Effect.ALLOW,
                  actions: ["kms:Decrypt"],
                  resources: [dynamoDBTable.encryptionKey.keyArn],
                  conditions: {
                    StringLike: {
                      "kms:ViaService": "dynamodb.*.amazonaws.com",
                    },
                  },
                })
              );
            }
            break;
        }
      });
    }

    // Secrets Manager の権限設定（IAM Policy Autopilot 生成ポリシーベース）
    if (secret) {
      permissions.forEach((permission) => {
        switch (permission) {
          case "read":
            // Secrets Manager 読み取り権限（IAM Policy Autopilot 生成）
            lambdaFunction.addToRolePolicy(
              new iam.PolicyStatement({
                effect: iam.Effect.ALLOW,
                actions: ["secretsmanager:GetSecretValue"],
                resources: [secret.secretArn],
              })
            );
            // KMS 復号化権限（Secrets Manager 経由）
            if (secret.encryptionKey) {
              lambdaFunction.addToRolePolicy(
                new iam.PolicyStatement({
                  effect: iam.Effect.ALLOW,
                  actions: ["kms:Decrypt"],
                  resources: [secret.encryptionKey.keyArn],
                  conditions: {
                    StringLike: {
                      "kms:ViaService": "secretsmanager.*.amazonaws.com",
                    },
                  },
                })
              );
            }
            break;

          case "write":
            // Secrets Manager 書き込み権限
            lambdaFunction.addToRolePolicy(
              new iam.PolicyStatement({
                effect: iam.Effect.ALLOW,
                actions: [
                  "secretsmanager:PutSecretValue",
                  "secretsmanager:UpdateSecret",
                ],
                resources: [secret.secretArn],
              })
            );
            break;
        }
      });
    }

    // EventBridge の権限設定（IAM Policy Autopilot 生成ポリシーベース）
    if (eventBus) {
      permissions.forEach((permission) => {
        switch (permission) {
          case "send":
            // EventBridge イベント送信権限（IAM Policy Autopilot 生成）
            lambdaFunction.addToRolePolicy(
              new iam.PolicyStatement({
                effect: iam.Effect.ALLOW,
                actions: ["events:PutEvents"],
                resources: [eventBus.eventBusArn],
              })
            );
            break;
        }
      });
    }

    // KMS キーの権限設定
    if (kmsKey) {
      permissions.forEach((permission) => {
        switch (permission) {
          case "read":
            // KMS 復号化権限
            lambdaFunction.addToRolePolicy(
              new iam.PolicyStatement({
                effect: iam.Effect.ALLOW,
                actions: ["kms:Decrypt"],
                resources: [kmsKey.keyArn],
              })
            );
            break;

          case "write":
            // KMS 暗号化権限
            lambdaFunction.addToRolePolicy(
              new iam.PolicyStatement({
                effect: iam.Effect.ALLOW,
                actions: ["kms:Encrypt", "kms:GenerateDataKey"],
                resources: [kmsKey.keyArn],
              })
            );
            break;
        }
      });
    }

    // Bedrock の権限設定（IAM Policy Autopilot 生成ポリシーベース）
    if (bedrockModelId) {
      permissions.forEach((permission) => {
        switch (permission) {
          case "invoke":
            // Bedrock モデル呼び出し権限（IAM Policy Autopilot 生成）
            // bedrock:ApplyGuardrail - Guardrail 適用権限
            lambdaFunction.addToRolePolicy(
              new iam.PolicyStatement({
                effect: iam.Effect.ALLOW,
                actions: ["bedrock:ApplyGuardrail"],
                resources: [
                  "arn:aws:bedrock:*:*:guardrail-profile/*",
                  "arn:aws:bedrock:*:*:guardrail/*",
                ],
              })
            );
            // bedrock:CallWithBearerToken, bedrock:InvokeModel - モデル呼び出し権限
            lambdaFunction.addToRolePolicy(
              new iam.PolicyStatement({
                effect: iam.Effect.ALLOW,
                actions: ["bedrock:CallWithBearerToken", "bedrock:InvokeModel"],
                resources: ["*"],
              })
            );
            break;
        }
      });
    }
  }

  /**
   * 読み取り権限を追加で付与する（IAM Policy Autopilot 生成ポリシー版）
   * @param lambdaFunction 権限を付与する Lambda 関数
   * @param s3Bucket アクセス対象の S3 バケット
   */
  public static grantRead(
    lambdaFunction: lambda.IFunction,
    s3Bucket: s3.IBucket
  ): void {
    lambdaFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "s3:GetObject",
          "s3:GetObjectLegalHold",
          "s3:GetObjectRetention",
          "s3:GetObjectTagging",
          "s3:GetObjectVersion",
        ],
        resources: [`${s3Bucket.bucketArn}/*`],
      })
    );
    lambdaFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["s3-object-lambda:GetObject"],
        resources: [`${s3Bucket.bucketArn}/*`],
      })
    );
  }

  /**
   * 書き込み権限を追加で付与する（IAM Policy Autopilot 生成ポリシー版）
   * @param lambdaFunction 権限を付与する Lambda 関数
   * @param s3Bucket アクセス対象の S3 バケット
   */
  public static grantWrite(
    lambdaFunction: lambda.IFunction,
    s3Bucket: s3.IBucket
  ): void {
    lambdaFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "s3:PutObject",
          "s3:PutObjectAcl",
          "s3:PutObjectLegalHold",
          "s3:PutObjectRetention",
          "s3:PutObjectTagging",
        ],
        resources: [`${s3Bucket.bucketArn}/*`],
      })
    );
    lambdaFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["s3-object-lambda:PutObject"],
        resources: [`${s3Bucket.bucketArn}/*`],
      })
    );
  }

  /**
   * 削除権限を追加で付与する（明示的ポリシー版）
   * @param lambdaFunction 権限を付与する Lambda 関数
   * @param s3Bucket アクセス対象の S3 バケット
   */
  public static grantDelete(
    lambdaFunction: lambda.IFunction,
    s3Bucket: s3.IBucket
  ): void {
    lambdaFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["s3:DeleteObject", "s3:DeleteObjectVersion"],
        resources: [`${s3Bucket.bucketArn}/*`],
      })
    );
  }

  /**
   * 読み書き権限を追加で付与する（IAM Policy Autopilot 生成ポリシー版）
   * @param lambdaFunction 権限を付与する Lambda 関数
   * @param s3Bucket アクセス対象の S3 バケット
   */
  public static grantReadWrite(
    lambdaFunction: lambda.IFunction,
    s3Bucket: s3.IBucket
  ): void {
    lambdaFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "s3:GetObject",
          "s3:GetObjectLegalHold",
          "s3:GetObjectRetention",
          "s3:GetObjectTagging",
          "s3:GetObjectVersion",
          "s3:PutObject",
          "s3:PutObjectAcl",
          "s3:PutObjectLegalHold",
          "s3:PutObjectRetention",
          "s3:PutObjectTagging",
        ],
        resources: [`${s3Bucket.bucketArn}/*`],
      })
    );
    lambdaFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["s3-object-lambda:GetObject", "s3-object-lambda:PutObject"],
        resources: [`${s3Bucket.bucketArn}/*`],
      })
    );
  }
}
