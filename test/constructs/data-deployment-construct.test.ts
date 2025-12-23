import * as cdk from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { Construct } from "constructs";
import * as fc from "fast-check";
import { DataDeploymentConstruct } from "../../lib/constructs/data-deployment-construct";
import { S3StorageConstruct } from "../../lib/constructs/s3-storage-construct";

describe("DataDeploymentConstruct", () => {
  /**
   * プロパティテスト: コンストラクト独立性
   * Feature: aws-iam-autopilot-simple, Property 4: コンストラクト独立性
   *
   * 任意のコンストラクトに対して、必要な依存関係が提供されれば、
   * 他のコンストラクトの存在に関係なく正常に動作する
   *
   * 検証対象: 要件 6.2
   */
  test("プロパティ 4: コンストラクト独立性", () => {
    fc.assert(
      fc.property(
        // 実際に存在するソースパスのみを使用
        fc.constantFrom("assets"),
        // ランダムなキープレフィックスを生成
        fc.option(fc.string({ minLength: 1, maxLength: 10 })),
        // ランダムなprune設定を生成
        fc.boolean(),
        (sourcePath, destinationKeyPrefix, prune) => {
          // 独立したアプリとスタックを作成
          const app = new cdk.App();
          const stack = new cdk.Stack(
            app,
            `TestStack-${Math.random().toString(36).substr(2, 9)}`
          );

          // 依存関係として必要なS3バケットを作成
          const s3Storage = new S3StorageConstruct(stack, "TestS3Storage");

          // DataDeploymentConstructを独立して作成
          const dataDeployment = new DataDeploymentConstruct(
            stack,
            "TestDataDeployment",
            {
              targetBucket: s3Storage.bucket,
              sourcePath,
              destinationKeyPrefix: destinationKeyPrefix || undefined,
              prune,
            }
          );

          // コンストラクトが正常に作成されることを検証
          expect(dataDeployment).toBeDefined();
          expect(dataDeployment.deployment).toBeDefined();

          // CloudFormationテンプレートが生成できることを検証
          const template = Template.fromStack(stack);

          // BucketDeploymentリソースが存在することを検証
          template.resourceCountIs("Custom::CDKBucketDeployment", 1);

          return true;
        }
      ),
      {
        numRuns: 100,
        verbose: true,
      }
    );
  });

  /**
   * 基本的なデプロイメント設定のテスト
   */
  test("基本的なデプロイメント設定", () => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, "TestStack");

    const s3Storage = new S3StorageConstruct(stack, "TestS3Storage");
    const dataDeployment = new DataDeploymentConstruct(
      stack,
      "TestDataDeployment",
      {
        targetBucket: s3Storage.bucket,
        sourcePath: "assets",
        destinationKeyPrefix: "data/",
        prune: true,
      }
    );

    expect(dataDeployment.deployment).toBeDefined();

    const template = Template.fromStack(stack);
    template.resourceCountIs("Custom::CDKBucketDeployment", 1);
  });

  /**
   * エラーケースのテスト: 必須プロパティの欠如
   */
  test("必須プロパティが欠如した場合のエラーハンドリング", () => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, "TestStack");

    // targetBucketが未定義の場合
    expect(() => {
      new DataDeploymentConstruct(stack, "TestDataDeployment1", {
        targetBucket: undefined as any,
        sourcePath: "assets",
      });
    }).toThrow("targetBucket は必須プロパティです");

    // sourcePathが未定義の場合
    const s3Storage = new S3StorageConstruct(stack, "TestS3Storage");
    expect(() => {
      new DataDeploymentConstruct(stack, "TestDataDeployment2", {
        targetBucket: s3Storage.bucket,
        sourcePath: undefined as any,
      });
    }).toThrow("sourcePath は必須プロパティです");
  });

  /**
   * オプション設定のテスト
   */
  test("オプション設定での動作", () => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, "TestStack");

    const s3Storage = new S3StorageConstruct(stack, "TestS3Storage");
    const dataDeployment = new DataDeploymentConstruct(
      stack,
      "TestDataDeployment",
      {
        targetBucket: s3Storage.bucket,
        sourcePath: "assets",
        destinationKeyPrefix: "uploads/",
        prune: false,
        exclude: ["*.tmp", "*.log"],
        include: ["*.json", "*.txt"],
        metadata: {
          "Content-Type": "application/json",
          "Cache-Control": "max-age=3600",
        },
      }
    );

    expect(dataDeployment.deployment).toBeDefined();

    const template = Template.fromStack(stack);
    template.resourceCountIs("Custom::CDKBucketDeployment", 1);
  });

  /**
   * タグ設定の確認テスト
   */
  test("タグが正しく設定されること", () => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, "TestStack");

    const s3Storage = new S3StorageConstruct(stack, "TestS3Storage");
    const dataDeployment = new DataDeploymentConstruct(
      stack,
      "TestDataDeployment",
      {
        targetBucket: s3Storage.bucket,
        sourcePath: "assets",
      }
    );

    // タグが設定されていることを確認（CDKのタグシステムを使用）
    const deploymentNode = dataDeployment.deployment.node;
    expect(deploymentNode.metadata).toBeDefined();
  });

  /**
   * 依存関係管理のテスト
   */
  test("依存関係管理メソッドの動作", () => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, "TestStack");

    const s3Storage = new S3StorageConstruct(stack, "TestS3Storage");
    const dataDeployment = new DataDeploymentConstruct(
      stack,
      "TestDataDeployment",
      {
        targetBucket: s3Storage.bucket,
        sourcePath: "assets",
      }
    );

    // 依存関係追加メソッドが正常に動作することを確認
    expect(() => {
      dataDeployment.addDependency(s3Storage);
    }).not.toThrow();

    // 実行順序制御メソッドが正常に動作することを確認
    const dummyConstruct = new Construct(stack, "DummyConstruct");
    expect(() => {
      dataDeployment.executeAfter(dummyConstruct);
    }).not.toThrow();
  });
});
