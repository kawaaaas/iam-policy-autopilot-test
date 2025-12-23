import * as cdk from "aws-cdk-lib";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as lambdaEventSources from "aws-cdk-lib/aws-lambda-event-sources";
import * as sqs from "aws-cdk-lib/aws-sqs";
import { Construct } from "constructs";

/**
 * EventSourceConstruct のプロパティインターフェース
 */
export interface EventSourceConstructProps {
  /** イベントソースとなる SQS キュー */
  queue: sqs.IQueue;

  /** イベントを受信する Lambda 関数 */
  lambdaFunction: lambda.IFunction;

  /** バッチサイズ（デフォルト: 10） */
  batchSize?: number;

  /** 最大バッチウィンドウ（デフォルト: 5秒） */
  maxBatchingWindow?: cdk.Duration;

  /** 部分的バッチレスポンスを有効にするか（デフォルト: true） */
  reportBatchItemFailures?: boolean;
}

/**
 * SQS と Lambda 間のイベントソースマッピングを管理するコンストラクト
 *
 * このコンストラクトは以下の責任を持ちます：
 * - SQS キューと Lambda 関数間のイベントソースマッピングの設定
 * - バッチサイズとバッチウィンドウの設定
 * - 部分的失敗レポートの設定
 */
export class EventSourceConstruct extends Construct {
  /** 作成されたイベントソースマッピング */
  public readonly eventSource: lambdaEventSources.SqsEventSource;

  constructor(scope: Construct, id: string, props: EventSourceConstructProps) {
    super(scope, id);

    // 必須プロパティの検証
    if (!props.queue) {
      throw new Error("queue は必須プロパティです");
    }

    if (!props.lambdaFunction) {
      throw new Error("lambdaFunction は必須プロパティです");
    }

    // デフォルト値の設定
    const {
      queue,
      lambdaFunction,
      batchSize = 10,
      maxBatchingWindow = cdk.Duration.seconds(5),
      reportBatchItemFailures = true,
    } = props;

    // SQS イベントソースの作成
    this.eventSource = new lambdaEventSources.SqsEventSource(queue, {
      batchSize,
      maxBatchingWindow,
      reportBatchItemFailures,
    });

    // Lambda 関数にイベントソースを追加
    lambdaFunction.addEventSource(this.eventSource);
  }
}
