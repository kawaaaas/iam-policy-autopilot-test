import * as cdk from "aws-cdk-lib";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { Construct } from "constructs";
import { DynamoDBTableConstruct } from "./constructs/dynamodb-table-construct";
import { EventSourceConstruct } from "./constructs/event-source-construct";
import { IAMPermissionConstruct } from "./constructs/iam-permission-construct";
import { LambdaFunctionConstruct } from "./constructs/lambda-function-construct";
import { SQSQueueConstruct } from "./constructs/sqs-queue-construct";

/**
 * Standard IAM テストスタック
 *
 * 中程度の複雑さを持つ AWS 環境を構築します。
 * Lambda 関数が SQS メッセージを受信して DynamoDB に保存する構成です。
 *
 * このスタックは以下の責任を持ちます：
 * - 各コンストラクトのインスタンス化と接続のみを行う
 * - 具体的な AWS リソースの設定は各コンストラクトに委譲
 * - 各コンストラクト間の依存関係を明確に管理
 * - 必要な出力値を外部に公開
 */
export class StandardIamTestStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // DynamoDB テーブルコンストラクトの作成
    const dynamoDBTable = new DynamoDBTableConstruct(this, "DynamoDBTable", {
      partitionKeyName: "messageId",
      sortKeyName: "timestamp",
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // SQS キューコンストラクトの作成
    const sqsQueue = new SQSQueueConstruct(this, "SQSQueue", {
      visibilityTimeout: cdk.Duration.seconds(300),
      maxReceiveCount: 3,
      enableDeadLetterQueue: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Lambda 関数コンストラクトの作成
    const lambdaFunction = new LambdaFunctionConstruct(this, "LambdaFunction", {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "index.handler",
      code: lambda.Code.fromAsset("lambda/sqs-dynamodb-processor"),
      environment: {
        TABLE_NAME: dynamoDBTable.tableName,
      },
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      description: "SQS メッセージを受信して DynamoDB に保存する Lambda 関数",
    });

    // IAM 権限コンストラクトの作成（SQS 受信権限）
    new IAMPermissionConstruct(this, "SQSPermission", {
      lambdaFunction: lambdaFunction.function,
      sqsQueue: sqsQueue.queue,
      permissions: ["consume"],
    });

    // IAM 権限コンストラクトの作成（DynamoDB 書き込み権限）
    new IAMPermissionConstruct(this, "DynamoDBPermission", {
      lambdaFunction: lambdaFunction.function,
      dynamoDBTable: dynamoDBTable.table,
      permissions: ["write"],
    });

    // イベントソースマッピングの設定
    new EventSourceConstruct(this, "EventSource", {
      queue: sqsQueue.queue,
      lambdaFunction: lambdaFunction.function,
      batchSize: 10,
      maxBatchingWindow: cdk.Duration.seconds(5),
      reportBatchItemFailures: true,
    });

    // 出力値の定義
    new cdk.CfnOutput(this, "TableName", {
      value: dynamoDBTable.tableName,
      description: "作成された DynamoDB テーブル名",
    });

    new cdk.CfnOutput(this, "QueueUrl", {
      value: sqsQueue.queueUrl,
      description: "作成された SQS キューの URL",
    });

    new cdk.CfnOutput(this, "QueueArn", {
      value: sqsQueue.queueArn,
      description: "作成された SQS キューの ARN",
    });

    if (sqsQueue.deadLetterQueue) {
      new cdk.CfnOutput(this, "DeadLetterQueueUrl", {
        value: sqsQueue.deadLetterQueue.queueUrl,
        description: "作成されたデッドレターキューの URL",
      });
    }

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
