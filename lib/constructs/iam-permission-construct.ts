import * as lambda from "aws-cdk-lib/aws-lambda";
import * as s3 from "aws-cdk-lib/aws-s3";
import { Construct } from "constructs";

/**
 * IAMPermissionConstruct のプロパティインターフェース
 */
export interface IAMPermissionConstructProps {
  /** 権限を付与する Lambda 関数 */
  lambdaFunction: lambda.IFunction;

  /** アクセス対象の S3 バケット */
  s3Bucket: s3.IBucket;

  /** 付与する権限の種類（デフォルト: ["read"]） */
  permissions?: ("read" | "write" | "delete")[];
}

/**
 * Lambda 関数と S3 バケット間の IAM 権限設定を管理する再利用可能なコンストラクト
 *
 * このコンストラクトは以下の責任を持ちます：
 * - Lambda 関数と S3 バケット間の IAM 権限設定の管理
 * - 最小権限の原則に従った権限付与
 * - CDK の標準 Grant メソッドを使用した権限設定
 * - 権限の種類に応じた適切な IAM ポリシーの生成
 */
export class IAMPermissionConstruct extends Construct {
  constructor(
    scope: Construct,
    id: string,
    props: IAMPermissionConstructProps
  ) {
    super(scope, id);

    // 必須プロパティの検証
    if (!props.lambdaFunction) {
      throw new Error("lambdaFunction は必須プロパティです");
    }

    if (!props.s3Bucket) {
      throw new Error("s3Bucket は必須プロパティです");
    }

    // デフォルト値の設定（最小権限の原則に従い、読み取りのみをデフォルトとする）
    const { lambdaFunction, s3Bucket, permissions = ["read"] } = props;

    // 権限の種類に応じて適切な Grant メソッドを呼び出し
    permissions.forEach((permission) => {
      switch (permission) {
        case "read":
          // S3 バケットからの読み取り権限を付与
          // s3:GetObject, s3:GetObjectVersion 権限が自動的に付与される
          s3Bucket.grantRead(lambdaFunction);
          break;

        case "write":
          // S3 バケットへの書き込み権限を付与
          // s3:PutObject, s3:PutObjectAcl 権限が自動的に付与される
          s3Bucket.grantWrite(lambdaFunction);
          break;

        case "delete":
          // S3 バケットからの削除権限を付与
          // s3:DeleteObject 権限が自動的に付与される
          s3Bucket.grantDelete(lambdaFunction);
          break;

        default:
          throw new Error(`サポートされていない権限タイプです: ${permission}`);
      }
    });
  }

  /**
   * 読み取り権限を追加で付与する
   * @param lambdaFunction 権限を付与する Lambda 関数
   * @param s3Bucket アクセス対象の S3 バケット
   */
  public static grantRead(
    lambdaFunction: lambda.IFunction,
    s3Bucket: s3.IBucket
  ): void {
    s3Bucket.grantRead(lambdaFunction);
  }

  /**
   * 書き込み権限を追加で付与する
   * @param lambdaFunction 権限を付与する Lambda 関数
   * @param s3Bucket アクセス対象の S3 バケット
   */
  public static grantWrite(
    lambdaFunction: lambda.IFunction,
    s3Bucket: s3.IBucket
  ): void {
    s3Bucket.grantWrite(lambdaFunction);
  }

  /**
   * 削除権限を追加で付与する
   * @param lambdaFunction 権限を付与する Lambda 関数
   * @param s3Bucket アクセス対象の S3 バケット
   */
  public static grantDelete(
    lambdaFunction: lambda.IFunction,
    s3Bucket: s3.IBucket
  ): void {
    s3Bucket.grantDelete(lambdaFunction);
  }

  /**
   * 読み書き権限を追加で付与する
   * @param lambdaFunction 権限を付与する Lambda 関数
   * @param s3Bucket アクセス対象の S3 バケット
   */
  public static grantReadWrite(
    lambdaFunction: lambda.IFunction,
    s3Bucket: s3.IBucket
  ): void {
    s3Bucket.grantReadWrite(lambdaFunction);
  }
}
