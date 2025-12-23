import * as cdk from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as fc from "fast-check";
import { S3StorageConstruct } from "../../lib/constructs/s3-storage-construct";

describe("S3StorageConstruct", () => {
  /**
   * プロパティテスト: コンストラクト独立性
   * Feature: aws-iam-autopilot-simple, Property 4: コンストラクト独立性
   *
   * 任意のコンストラクトに対して、必要な依存関係が提供されれば、
   * 他のコンストラクトの存在に関係なく正常に動作する
   *
   * 検証対象: 要件 6.1
   */
  test("プロパティ 4: コンストラクト独立性", () => {
    fc.assert(
      fc.property(
        // ランダムな暗号化設定を生成
        fc.constantFrom(
          s3.BucketEncryption.S3_MANAGED,
          s3.BucketEncryption.KMS_MANAGED,
          s3.BucketEncryption.UNENCRYPTED
        ),
        // ランダムな削除ポリシーを生成
        fc.constantFrom(
          cdk.RemovalPolicy.DESTROY,
          cdk.RemovalPolicy.RETAIN,
          cdk.RemovalPolicy.SNAPSHOT
        ),
        (encryption, removalPolicy) => {
          // 独立したアプリとスタックを作成
          const app = new cdk.App();
          const stack = new cdk.Stack(
            app,
            `TestStack-${Math.random().toString(36).substr(2, 9)}`
          );

          // S3StorageConstructを独立して作成
          const s3Storage = new S3StorageConstruct(stack, "TestS3Storage", {
            encryption,
            removalPolicy,
            blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
          });

          // コンストラクトが正常に作成されることを検証
          expect(s3Storage).toBeDefined();
          expect(s3Storage.bucket).toBeDefined();
          expect(s3Storage.bucket).toBeInstanceOf(s3.Bucket);

          // CloudFormationテンプレートが生成できることを検証
          const template = Template.fromStack(stack);

          // S3バケットリソースが存在することを検証
          template.resourceCountIs("AWS::S3::Bucket", 1);

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
   * カスタム設定での動作確認テスト
   */
  test("カスタム設定での動作", () => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, "TestStack");

    const s3Storage = new S3StorageConstruct(stack, "TestS3Storage", {
      encryption: s3.BucketEncryption.KMS_MANAGED,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
    });

    expect(s3Storage.bucket).toBeDefined();

    const template = Template.fromStack(stack);
    template.hasResourceProperties("AWS::S3::Bucket", {
      BucketEncryption: {
        ServerSideEncryptionConfiguration: [
          {
            ServerSideEncryptionByDefault: {
              SSEAlgorithm: "aws:kms",
            },
          },
        ],
      },
    });
  });

  /**
   * エラーケースのテスト: 無効なバケット名
   */
  test("無効なバケット名でのエラーハンドリング", () => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, "TestStack");

    // 無効なバケット名（大文字を含む）でコンストラクトを作成
    expect(() => {
      new S3StorageConstruct(stack, "TestS3Storage", {
        bucketName: "INVALID-BUCKET-NAME", // 大文字は無効
      });
    }).toThrow();
  });

  /**
   * タグ設定の確認テスト
   */
  test("タグが正しく設定されること", () => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, "TestStack");

    const s3Storage = new S3StorageConstruct(stack, "TestS3Storage");

    const template = Template.fromStack(stack);
    template.hasResourceProperties("AWS::S3::Bucket", {
      Tags: [
        {
          Key: "Component",
          Value: "S3Storage",
        },
        {
          Key: "ManagedBy",
          Value: "S3StorageConstruct",
        },
      ],
    });
  });

  /**
   * パブリックアクセスブロック設定の確認テスト
   */
  test("パブリックアクセスブロックが正しく設定されること", () => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, "TestStack");

    const s3Storage = new S3StorageConstruct(stack, "TestS3Storage", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
    });

    const template = Template.fromStack(stack);
    template.hasResourceProperties("AWS::S3::Bucket", {
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
    });
  });
});
