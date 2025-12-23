import * as cdk from "aws-cdk-lib";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as s3 from "aws-cdk-lib/aws-s3";
import { Construct } from "constructs";
import { EventBridgeConstruct } from "./constructs/eventbridge-construct";
import { IAMPermissionConstruct } from "./constructs/iam-permission-construct";
import { KMSKeyConstruct } from "./constructs/kms-key-construct";
import { LambdaFunctionConstruct } from "./constructs/lambda-function-construct";
import { S3StorageConstruct } from "./constructs/s3-storage-construct";
import { SecretsManagerConstruct } from "./constructs/secrets-manager-construct";

/**
 * Complex IAM テストスタック
 *
 * 最も複雑な AWS 環境を構築します。
 * Lambda 関数が Bedrock、KMS 暗号化された S3、Secrets Manager、EventBridge を統合利用する構成です。
 *
 * このスタックは以下の責任を持ちます：
 * - 各コンストラクトのインスタンス化と接続のみを行う
 * - 具体的な AWS リソースの設定は各コンストラクトに委譲
 * - 複雑なコンストラクト間の依存関係を明確に管理
 * - 必要な出力値を外部に公開
 */
export class ComplexIamTestStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Bedrock モデル ID（Claude 3 Sonnet）
    const bedrockModelId = "anthropic.claude-3-sonnet-20240229-v1:0";

    // S3 用 KMS キーコンストラクトの作成
    const s3KmsKey = new KMSKeyConstruct(this, "S3KmsKey", {
      description: "S3 バケット暗号化用 KMS キー",
      enableKeyRotation: true,
      alias: "alias/complex-iam-test-s3-key",
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      pendingWindow: cdk.Duration.days(7),
    });

    // Secrets Manager 用 KMS キーコンストラクトの作成
    const secretsKmsKey = new KMSKeyConstruct(this, "SecretsKmsKey", {
      description: "Secrets Manager 暗号化用 KMS キー",
      enableKeyRotation: true,
      alias: "alias/complex-iam-test-secrets-key",
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      pendingWindow: cdk.Duration.days(7),
    });

    // KMS 暗号化 S3 バケットコンストラクトの作成
    const s3Storage = new S3StorageConstruct(this, "S3Storage", {
      encryption: s3.BucketEncryption.KMS,
      encryptionKey: s3KmsKey.key,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // Secrets Manager コンストラクトの作成
    const webhookSecret = new SecretsManagerConstruct(this, "WebhookSecret", {
      description: "外部通知用 Webhook URL",
      encryptionKey: secretsKmsKey.key,
      secretValue: {
        webhookUrl: "https://example.com/webhook",
      },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // EventBridge カスタムバスコンストラクトの作成
    const eventBridge = new EventBridgeConstruct(this, "EventBridge", {
      eventBusName: "complex-iam-test-bus",
      description: "Complex IAM テスト用カスタムイベントバス",
    });

    // Lambda 関数コンストラクトの作成
    const lambdaFunction = new LambdaFunctionConstruct(this, "LambdaFunction", {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "index.handler",
      code: lambda.Code.fromAsset("lambda/complex-bedrock-processor"),
      environment: {
        BUCKET_NAME: s3Storage.bucket.bucketName,
        SECRET_ARN: webhookSecret.secretArn,
        EVENT_BUS_NAME: eventBridge.eventBusName,
        BEDROCK_MODEL_ID: bedrockModelId,
      },
      timeout: cdk.Duration.seconds(60),
      memorySize: 512,
      description:
        "Bedrock、S3、Secrets Manager、EventBridge を統合する Lambda 関数",
    });

    // S3 読み書き権限の付与（KMS 暗号化/復号化権限も含む）
    new IAMPermissionConstruct(this, "S3Permission", {
      lambdaFunction: lambdaFunction.function,
      s3Bucket: s3Storage.bucket,
      permissions: ["read", "write"],
    });

    // Secrets Manager 読み取り権限の付与（KMS 復号化権限も含む）
    new IAMPermissionConstruct(this, "SecretsPermission", {
      lambdaFunction: lambdaFunction.function,
      secret: webhookSecret.secret,
      permissions: ["read"],
    });

    // EventBridge イベント送信権限の付与
    new IAMPermissionConstruct(this, "EventBridgePermission", {
      lambdaFunction: lambdaFunction.function,
      eventBus: eventBridge.eventBus,
      permissions: ["send"],
    });

    // Bedrock モデル呼び出し権限の付与
    new IAMPermissionConstruct(this, "BedrockPermission", {
      lambdaFunction: lambdaFunction.function,
      bedrockModelId: bedrockModelId,
      permissions: ["invoke"],
    });

    // 出力値の定義
    new cdk.CfnOutput(this, "BucketName", {
      value: s3Storage.bucket.bucketName,
      description: "作成された S3 バケット名",
    });

    new cdk.CfnOutput(this, "S3KmsKeyArn", {
      value: s3KmsKey.keyArn,
      description: "S3 暗号化用 KMS キーの ARN",
    });

    new cdk.CfnOutput(this, "SecretsKmsKeyArn", {
      value: secretsKmsKey.keyArn,
      description: "Secrets Manager 暗号化用 KMS キーの ARN",
    });

    new cdk.CfnOutput(this, "SecretArn", {
      value: webhookSecret.secretArn,
      description: "作成された Secrets Manager シークレットの ARN",
    });

    new cdk.CfnOutput(this, "EventBusArn", {
      value: eventBridge.eventBusArn,
      description: "作成された EventBridge イベントバスの ARN",
    });

    new cdk.CfnOutput(this, "LambdaFunctionName", {
      value: lambdaFunction.functionName,
      description: "作成された Lambda 関数名",
    });

    new cdk.CfnOutput(this, "LambdaFunctionArn", {
      value: lambdaFunction.functionArn,
      description: "作成された Lambda 関数の ARN",
    });
  }
}
