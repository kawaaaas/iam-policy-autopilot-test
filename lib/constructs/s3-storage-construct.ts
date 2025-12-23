import * as cdk from "aws-cdk-lib";
import * as s3 from "aws-cdk-lib/aws-s3";
import { Construct } from "constructs";

/**
 * S3StorageConstruct のプロパティインターフェース
 */
export interface S3StorageConstructProps {
  /** バケット名（オプション、未指定の場合は自動生成） */
  bucketName?: string;

  /** 暗号化設定（デフォルト: S3_MANAGED） */
  encryption?: s3.BucketEncryption;

  /** 削除ポリシー（デフォルト: DESTROY） */
  removalPolicy?: cdk.RemovalPolicy;

  /** パブリックアクセスブロック設定（デフォルト: BLOCK_ALL） */
  blockPublicAccess?: s3.BlockPublicAccess;
}

/**
 * S3 バケットとその設定を管理する再利用可能なコンストラクト
 *
 * このコンストラクトは以下の責任を持ちます：
 * - S3 バケットの作成と基本設定の管理
 * - セキュリティ設定（暗号化、パブリックアクセスブロック）
 * - ライフサイクル管理（削除ポリシー）
 */
export class S3StorageConstruct extends Construct {
  /** 作成された S3 バケットインスタンス */
  public readonly bucket: s3.Bucket;

  constructor(scope: Construct, id: string, props?: S3StorageConstructProps) {
    super(scope, id);

    // デフォルト値の設定
    const {
      bucketName,
      encryption = s3.BucketEncryption.S3_MANAGED,
      removalPolicy = cdk.RemovalPolicy.DESTROY,
      blockPublicAccess = s3.BlockPublicAccess.BLOCK_ALL,
    } = props || {};

    // S3 バケットの作成
    this.bucket = new s3.Bucket(this, "Bucket", {
      bucketName,
      encryption,
      removalPolicy,
      blockPublicAccess,
    });

    // タグの追加（管理とコスト追跡のため）
    cdk.Tags.of(this.bucket).add("Component", "S3Storage");
    cdk.Tags.of(this.bucket).add("ManagedBy", "S3StorageConstruct");
  }
}
