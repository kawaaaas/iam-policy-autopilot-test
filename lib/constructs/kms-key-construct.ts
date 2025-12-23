import * as cdk from "aws-cdk-lib";
import * as kms from "aws-cdk-lib/aws-kms";
import { Construct } from "constructs";

/**
 * KMS キーコンストラクトのプロパティ
 */
export interface KMSKeyConstructProps {
  /**
   * KMS キーの説明
   */
  readonly description: string;

  /**
   * キーローテーションを有効にするかどうか
   * @default true
   */
  readonly enableKeyRotation?: boolean;

  /**
   * キーのエイリアス（オプション）
   */
  readonly alias?: string;

  /**
   * 削除ポリシー
   * @default cdk.RemovalPolicy.RETAIN
   */
  readonly removalPolicy?: cdk.RemovalPolicy;

  /**
   * 保留期間（日数）
   * @default 7
   */
  readonly pendingWindow?: cdk.Duration;
}

/**
 * KMS キーコンストラクト
 *
 * カスタマーマネージド KMS キーを作成し、設定を管理する再利用可能なコンストラクトです。
 * S3 暗号化や Secrets Manager 暗号化など、様々な用途に使用できます。
 */
export class KMSKeyConstruct extends Construct {
  /**
   * 作成された KMS キー
   */
  public readonly key: kms.Key;

  /**
   * KMS キーの ARN
   */
  public readonly keyArn: string;

  /**
   * KMS キーの ID
   */
  public readonly keyId: string;

  constructor(scope: Construct, id: string, props: KMSKeyConstructProps) {
    super(scope, id);

    // KMS キーの作成
    this.key = new kms.Key(this, "Key", {
      description: props.description,
      enableKeyRotation: props.enableKeyRotation ?? true,
      removalPolicy: props.removalPolicy ?? cdk.RemovalPolicy.RETAIN,
      pendingWindow: props.pendingWindow ?? cdk.Duration.days(7),
    });

    // エイリアスの設定（オプション）
    if (props.alias) {
      this.key.addAlias(props.alias);
    }

    // プロパティの設定
    this.keyArn = this.key.keyArn;
    this.keyId = this.key.keyId;
  }

  /**
   * 指定されたプリンシパルに暗号化権限を付与
   */
  public grantEncrypt(grantee: cdk.aws_iam.IGrantable): cdk.aws_iam.Grant {
    return this.key.grantEncrypt(grantee);
  }

  /**
   * 指定されたプリンシパルに復号化権限を付与
   */
  public grantDecrypt(grantee: cdk.aws_iam.IGrantable): cdk.aws_iam.Grant {
    return this.key.grantDecrypt(grantee);
  }

  /**
   * 指定されたプリンシパルに暗号化・復号化権限を付与
   */
  public grantEncryptDecrypt(
    grantee: cdk.aws_iam.IGrantable
  ): cdk.aws_iam.Grant {
    return this.key.grantEncryptDecrypt(grantee);
  }
}
