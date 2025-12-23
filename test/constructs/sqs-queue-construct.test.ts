import * as cdk from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { SQSQueueConstruct } from "../../lib/constructs/sqs-queue-construct";

/**
 * SQSQueueConstruct のユニットテスト
 *
 * テスト対象:
 * - メインキューの作成
 * - デッドレターキューの作成と設定
 * - 可視性タイムアウトの設定
 * - 要件: 2.1, 2.3, 2.4
 */
describe("SQSQueueConstruct", () => {
  let app: cdk.App;
  let stack: cdk.Stack;

  beforeEach(() => {
    app = new cdk.App();
    stack = new cdk.Stack(app, "TestStack");
  });

  describe("デフォルト設定でのキュー作成", () => {
    test("メインキューが作成される", () => {
      // Arrange & Act
      new SQSQueueConstruct(stack, "TestQueue");

      // Assert
      const template = Template.fromStack(stack);
      template.resourceCountIs("AWS::SQS::Queue", 2); // メインキュー + DLQ
    });

    test("デッドレターキューが作成される", () => {
      // Arrange & Act
      new SQSQueueConstruct(stack, "TestQueue");

      // Assert
      const template = Template.fromStack(stack);
      // DLQ は 14 日間のメッセージ保持期間を持つ
      template.hasResourceProperties("AWS::SQS::Queue", {
        MessageRetentionPeriod: 1209600, // 14日 = 1209600秒
      });
    });

    test("メインキューにデッドレターキュー設定がある", () => {
      // Arrange & Act
      new SQSQueueConstruct(stack, "TestQueue");

      // Assert
      const template = Template.fromStack(stack);
      template.hasResourceProperties("AWS::SQS::Queue", {
        RedrivePolicy: Match.objectLike({
          maxReceiveCount: 3,
        }),
      });
    });

    test("デフォルトの可視性タイムアウトが300秒", () => {
      // Arrange & Act
      new SQSQueueConstruct(stack, "TestQueue");

      // Assert
      const template = Template.fromStack(stack);
      template.hasResourceProperties("AWS::SQS::Queue", {
        VisibilityTimeout: 300,
      });
    });
  });

  describe("カスタム設定でのキュー作成", () => {
    test("カスタム可視性タイムアウトが設定される", () => {
      // Arrange & Act
      new SQSQueueConstruct(stack, "TestQueue", {
        visibilityTimeout: cdk.Duration.seconds(600),
      });

      // Assert
      const template = Template.fromStack(stack);
      template.hasResourceProperties("AWS::SQS::Queue", {
        VisibilityTimeout: 600,
      });
    });

    test("カスタム最大受信回数が設定される", () => {
      // Arrange & Act
      new SQSQueueConstruct(stack, "TestQueue", {
        maxReceiveCount: 5,
      });

      // Assert
      const template = Template.fromStack(stack);
      template.hasResourceProperties("AWS::SQS::Queue", {
        RedrivePolicy: Match.objectLike({
          maxReceiveCount: 5,
        }),
      });
    });

    test("デッドレターキューを無効にできる", () => {
      // Arrange & Act
      new SQSQueueConstruct(stack, "TestQueue", {
        enableDeadLetterQueue: false,
      });

      // Assert
      const template = Template.fromStack(stack);
      template.resourceCountIs("AWS::SQS::Queue", 1); // メインキューのみ
    });

    test("カスタムキュー名が設定される", () => {
      // Arrange & Act
      new SQSQueueConstruct(stack, "TestQueue", {
        queueName: "CustomQueueName",
      });

      // Assert
      const template = Template.fromStack(stack);
      template.hasResourceProperties("AWS::SQS::Queue", {
        QueueName: "CustomQueueName",
      });
    });

    test("カスタムキュー名でDLQも命名される", () => {
      // Arrange & Act
      new SQSQueueConstruct(stack, "TestQueue", {
        queueName: "CustomQueueName",
      });

      // Assert
      const template = Template.fromStack(stack);
      template.hasResourceProperties("AWS::SQS::Queue", {
        QueueName: "CustomQueueName-dlq",
      });
    });
  });

  describe("コンストラクトのプロパティ", () => {
    test("queueArn が取得できる", () => {
      // Arrange & Act
      const construct = new SQSQueueConstruct(stack, "TestQueue");

      // Assert
      expect(construct.queueArn).toBeDefined();
    });

    test("queueUrl が取得できる", () => {
      // Arrange & Act
      const construct = new SQSQueueConstruct(stack, "TestQueue");

      // Assert
      expect(construct.queueUrl).toBeDefined();
    });

    test("queueName が取得できる", () => {
      // Arrange & Act
      const construct = new SQSQueueConstruct(stack, "TestQueue");

      // Assert
      expect(construct.queueName).toBeDefined();
    });

    test("deadLetterQueue が取得できる（有効時）", () => {
      // Arrange & Act
      const construct = new SQSQueueConstruct(stack, "TestQueue", {
        enableDeadLetterQueue: true,
      });

      // Assert
      expect(construct.deadLetterQueue).toBeDefined();
    });

    test("deadLetterQueue が undefined（無効時）", () => {
      // Arrange & Act
      const construct = new SQSQueueConstruct(stack, "TestQueue", {
        enableDeadLetterQueue: false,
      });

      // Assert
      expect(construct.deadLetterQueue).toBeUndefined();
    });
  });

  describe("タグ設定", () => {
    test("メインキューにタグが設定される", () => {
      // Arrange & Act
      new SQSQueueConstruct(stack, "TestQueue");

      // Assert
      const template = Template.fromStack(stack);
      template.hasResourceProperties("AWS::SQS::Queue", {
        Tags: Match.arrayWith([
          Match.objectLike({ Key: "Component", Value: "SQSQueue" }),
          Match.objectLike({ Key: "ManagedBy", Value: "SQSQueueConstruct" }),
        ]),
      });
    });
  });
});
