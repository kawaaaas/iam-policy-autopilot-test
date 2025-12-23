import * as cdk from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { StandardIamTestStack } from "../lib/standard-iam-test-stack";

describe("StandardIamTestStack", () => {
  let app: cdk.App;
  let stack: StandardIamTestStack;
  let template: Template;

  beforeAll(() => {
    app = new cdk.App();
    stack = new StandardIamTestStack(app, "TestStack");
    template = Template.fromStack(stack);
  });

  describe("タスク 5.1: Lambda 関数リソースの定義", () => {
    test("Lambda 関数が Node.js 22.x ランタイムで作成される", () => {
      template.hasResourceProperties("AWS::Lambda::Function", {
        Runtime: "nodejs22.x",
        Handler: "index.handler",
      });
    });

    test("Lambda 関数に TABLE_NAME 環境変数が設定される", () => {
      template.hasResourceProperties("AWS::Lambda::Function", {
        Environment: {
          Variables: {
            TABLE_NAME: Match.anyValue(),
          },
        },
      });
    });

    test("Lambda 関数にタイムアウトとメモリサイズが設定される", () => {
      template.hasResourceProperties("AWS::Lambda::Function", {
        Timeout: 30,
        MemorySize: 256,
      });
    });
  });

  describe("タスク 5.2: IAM 権限の設定", () => {
    test("Lambda 実行ロールが作成される", () => {
      template.hasResourceProperties("AWS::IAM::Role", {
        AssumeRolePolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Action: "sts:AssumeRole",
              Effect: "Allow",
              Principal: {
                Service: "lambda.amazonaws.com",
              },
            }),
          ]),
        },
      });
    });

    test("SQS 受信権限が Lambda 関数に付与される", () => {
      // SQS の grantConsumeMessages による権限付与を確認
      template.hasResourceProperties("AWS::IAM::Policy", {
        PolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Action: Match.arrayWith([
                "sqs:ReceiveMessage",
                "sqs:ChangeMessageVisibility",
                "sqs:GetQueueUrl",
                "sqs:DeleteMessage",
                "sqs:GetQueueAttributes",
              ]),
              Effect: "Allow",
            }),
          ]),
        },
      });
    });

    test("DynamoDB 書き込み権限が Lambda 関数に付与される", () => {
      // DynamoDB の grantWriteData による権限付与を確認
      template.hasResourceProperties("AWS::IAM::Policy", {
        PolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Action: Match.arrayWith([
                "dynamodb:BatchWriteItem",
                "dynamodb:PutItem",
                "dynamodb:UpdateItem",
                "dynamodb:DeleteItem",
                "dynamodb:DescribeTable",
              ]),
              Effect: "Allow",
            }),
          ]),
        },
      });
    });
  });

  describe("タスク 5.3: イベントソースマッピングの設定", () => {
    test("SQS イベントソースマッピングが作成される", () => {
      template.hasResourceProperties("AWS::Lambda::EventSourceMapping", {
        BatchSize: 10,
        MaximumBatchingWindowInSeconds: 5,
        FunctionResponseTypes: ["ReportBatchItemFailures"],
      });
    });

    test("イベントソースマッピングが SQS キューに接続される", () => {
      template.hasResourceProperties("AWS::Lambda::EventSourceMapping", {
        EventSourceArn: Match.anyValue(),
      });
    });
  });

  describe("リソース作成の確認", () => {
    test("DynamoDB テーブルが作成される", () => {
      template.hasResourceProperties("AWS::DynamoDB::Table", {
        KeySchema: Match.arrayWith([
          { AttributeName: "messageId", KeyType: "HASH" },
          { AttributeName: "timestamp", KeyType: "RANGE" },
        ]),
        BillingMode: "PAY_PER_REQUEST",
      });
    });

    test("SQS メインキューが作成される", () => {
      template.resourceCountIs("AWS::SQS::Queue", 2); // メインキュー + DLQ
    });

    test("デッドレターキューが設定される", () => {
      template.hasResourceProperties("AWS::SQS::Queue", {
        RedrivePolicy: Match.objectLike({
          maxReceiveCount: 3,
        }),
      });
    });
  });

  describe("出力値の確認", () => {
    test("テーブル名が出力される", () => {
      template.hasOutput("TableName", {});
    });

    test("キュー URL が出力される", () => {
      template.hasOutput("QueueUrl", {});
    });

    test("Lambda 関数名が出力される", () => {
      template.hasOutput("LambdaFunctionName", {});
    });
  });
});
