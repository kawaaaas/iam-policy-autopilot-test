import * as cdk from "aws-cdk-lib";
import * as kms from "aws-cdk-lib/aws-kms";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import { Construct } from "constructs";

/**
 * Secrets Manager コンストラクトのプロパティ
 */
export interface SecretsManagerConstructProps {
  /**
   * シークレットの説明
   */
  readonly description: string;

  /**
   * 暗号化に使用する KMS キー（オプション）
   * 指定しない場合は AWS マネージドキーを使用
   */
  readonly encryptionKey?: kms.IKey;

  /**
   * シークレットの初期値（JSON 形式）
   */
  readonly secretValue?: { [key: string]: string };

  /**
   * シークレット名（オプション）
   */
  readonly secretName?: string;

  /**
   * 削除ポリシー
   * @default cdk.RemovalPolicy.DESTROY
   */
  readonly removalPolicy?: cdk.RemovalPolicy;
}

/**
 * Secrets Manager コンストラクト
 *
 * AWS Secrets Manager のシークレットを作成し、設定を管理する再利用可能なコンストラクトです。
 * カスタマーマネージド KMS キーによる暗号化をサポートします。
 */
export class SecretsManagerConstruct extends Construct {
  /**
   * 作成された Secrets Manager シークレット
   */
  public readonly secret: secretsmanager.Secret;

  /**
   * シークレットの ARN
   */
  public readonly secretArn: string;

  /**
   * シークレット名
   */
  public readonly secretName: string;

  constructor(
    scope: Construct,
    id: string,
    props: SecretsManagerConstructProps
  ) {
    super(scope, id);

    // シークレットの作成
    this.secret = new secretsmanager.Secret(this, "Secret", {
      description: props.description,
      encryptionKey: props.encryptionKey,
      secretName: props.secretName,
      removalPolicy: props.removalPolicy ?? cdk.RemovalPolicy.DESTROY,
      secretObjectValue: props.secretValue
        ? Object.fromEntries(
            Object.entries(props.secretValue).map(([key, value]) => [
              key,
              cdk.SecretValue.unsafePlainText(value),
            ])
          )
        : undefined,
    });

    // プロパティの設定
    this.secretArn = this.secret.secretArn;
    this.secretName = this.secret.secretName;
  }

  /**
   * 指定されたプリンシパルにシークレット読み取り権限を付与
   */
  public grantRead(grantee: cdk.aws_iam.IGrantable): cdk.aws_iam.Grant {
    return this.secret.grantRead(grantee);
  }

  /**
   * 指定されたプリンシパルにシークレット書き込み権限を付与
   */
  public grantWrite(grantee: cdk.aws_iam.IGrantable): cdk.aws_iam.Grant {
    return this.secret.grantWrite(grantee);
  }
}
