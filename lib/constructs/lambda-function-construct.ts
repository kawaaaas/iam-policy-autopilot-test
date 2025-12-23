import * as cdk from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as logs from "aws-cdk-lib/aws-logs";
import { Construct } from "constructs";

/**
 * LambdaFunctionConstruct のプロパティインターフェース
 */
export interface LambdaFunctionConstructProps {
  /** 関数名（オプション、未指定の場合は自動生成） */
  functionName?: string;

  /** ランタイム環境（デフォルト: NODEJS_22_X） */
  runtime?: lambda.Runtime;

  /** ハンドラー関数のパス（デフォルト: index.handler） */
  handler?: string;

  /** Lambda 関数のコード */
  code: lambda.Code;

  /** 環境変数（オプション） */
  environment?: { [key: string]: string };

  /** タイムアウト時間（デフォルト: 30秒） */
  timeout?: cdk.Duration;

  /** メモリサイズ（デフォルト: 128MB） */
  memorySize?: number;

  /** 説明文（オプション） */
  description?: string;

  /** 予約済み同時実行数（オプション） */
  reservedConcurrentExecutions?: number;
}

/**
 * Lambda 関数とその設定を管理する再利用可能なコンストラクト
 *
 * このコンストラクトは以下の責任を持ちます：
 * - Lambda 関数の作成と基本設定の管理
 * - ランタイム環境とリソース設定
 * - 環境変数とタイムアウト設定
 * - 監視とログ設定
 */
export class LambdaFunctionConstruct extends Construct {
  /** 作成された Lambda 関数インスタンス */
  public readonly function: lambda.Function;

  constructor(
    scope: Construct,
    id: string,
    props: LambdaFunctionConstructProps
  ) {
    super(scope, id);

    // 必須プロパティの検証
    if (!props.code) {
      throw new Error("code は必須プロパティです");
    }

    // デフォルト値の設定
    const {
      functionName,
      runtime = lambda.Runtime.NODEJS_22_X,
      handler = "index.handler",
      code,
      environment,
      timeout = cdk.Duration.seconds(30),
      memorySize = 128,
      description,
      reservedConcurrentExecutions,
    } = props;

    // Lambda 関数の作成
    this.function = new lambda.Function(this, "Function", {
      functionName,
      runtime,
      handler,
      code,
      environment,
      timeout,
      memorySize,
      description: description || `Lambda関数 - ${id}`,
      reservedConcurrentExecutions,
      // ログ保持期間を設定（コスト最適化のため）
      logRetention: logs.RetentionDays.ONE_WEEK,
    });

    // タグの追加（管理とコスト追跡のため）
    cdk.Tags.of(this.function).add("Component", "LambdaFunction");
    cdk.Tags.of(this.function).add("ManagedBy", "LambdaFunctionConstruct");
    cdk.Tags.of(this.function).add("Runtime", runtime.name);
  }

  /**
   * Lambda 関数に環境変数を追加
   * @param key 環境変数のキー
   * @param value 環境変数の値
   */
  public addEnvironment(key: string, value: string): void {
    this.function.addEnvironment(key, value);
  }

  /**
   * Lambda 関数にイベントソースを追加
   * @param eventSource イベントソース
   */
  public addEventSource(eventSource: lambda.IEventSource): void {
    this.function.addEventSource(eventSource);
  }

  /**
   * Lambda 関数の実行ロールを取得
   * @returns Lambda 関数の実行ロール
   */
  public get executionRole(): iam.IRole | undefined {
    return this.function.role;
  }

  /**
   * Lambda 関数の ARN を取得
   * @returns Lambda 関数の ARN
   */
  public get functionArn(): string {
    return this.function.functionArn;
  }

  /**
   * Lambda 関数名を取得
   * @returns Lambda 関数名
   */
  public get functionName(): string {
    return this.function.functionName;
  }
}
