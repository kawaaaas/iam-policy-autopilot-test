import * as cdk from "aws-cdk-lib";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";
import { Construct } from "constructs";

/**
 * DataDeploymentConstruct のプロパティインターフェース
 */
export interface DataDeploymentConstructProps {
  /** デプロイ先の S3 バケット */
  targetBucket: s3.IBucket;

  /** ローカルファイルのソースパス */
  sourcePath: string;

  /** S3 内の宛先キープレフィックス（オプション） */
  destinationKeyPrefix?: string;

  /** デプロイ時に既存ファイルを削除するかどうか（デフォルト: false） */
  prune?: boolean;

  /** ファイルの除外パターン（オプション） */
  exclude?: string[];

  /** ファイルの包含パターン（オプション） */
  include?: string[];

  /** メタデータの設定（オプション） */
  metadata?: { [key: string]: string };

  /** キャッシュ制御の設定（オプション） */
  cacheControl?: s3deploy.CacheControl[];

  /** コンテンツタイプの設定（オプション） */
  contentType?: string;

  /** コンテンツエンコーディングの設定（オプション） */
  contentEncoding?: string;
}

/**
 * ローカルファイルの S3 バケットへのデプロイメントを管理する再利用可能なコンストラクト
 *
 * このコンストラクトは以下の責任を持ちます：
 * - ローカルファイルやディレクトリの S3 バケットへのデプロイメント
 * - デプロイメントオプションの設定（prune、exclude、include など）
 * - メタデータやキャッシュ制御の設定
 * - デプロイメント時の権限管理
 */
export class DataDeploymentConstruct extends Construct {
  /** 作成された BucketDeployment インスタンス */
  public readonly deployment: s3deploy.BucketDeployment;

  constructor(
    scope: Construct,
    id: string,
    props: DataDeploymentConstructProps
  ) {
    super(scope, id);

    // 必須プロパティの検証
    if (!props.targetBucket) {
      throw new Error("targetBucket は必須プロパティです");
    }

    if (!props.sourcePath) {
      throw new Error("sourcePath は必須プロパティです");
    }

    // デフォルト値の設定
    const {
      targetBucket,
      sourcePath,
      destinationKeyPrefix,
      prune = false,
      exclude,
      include,
      metadata,
      cacheControl,
      contentType,
      contentEncoding,
    } = props;

    // BucketDeployment の作成
    this.deployment = new s3deploy.BucketDeployment(this, "Deployment", {
      sources: [s3deploy.Source.asset(sourcePath)],
      destinationBucket: targetBucket,
      destinationKeyPrefix,
      prune,
      exclude,
      include,
      metadata,
      cacheControl,
      contentType,
      contentEncoding,
    });

    // タグの追加（管理とコスト追跡のため）
    cdk.Tags.of(this.deployment).add("Component", "DataDeployment");
    cdk.Tags.of(this.deployment).add("ManagedBy", "DataDeploymentConstruct");
    cdk.Tags.of(this.deployment).add("SourcePath", sourcePath);
  }

  /**
   * デプロイメントが完了した後に実行される依存関係を追加
   * @param dependency 依存するリソース
   */
  public addDependency(dependency: Construct): void {
    this.deployment.node.addDependency(dependency);
  }

  /**
   * デプロイメントの実行順序を制御するためのメソッド
   * @param resource このデプロイメントの後に実行されるリソース
   */
  public executeAfter(resource: Construct): void {
    resource.node.addDependency(this.deployment);
  }
}
