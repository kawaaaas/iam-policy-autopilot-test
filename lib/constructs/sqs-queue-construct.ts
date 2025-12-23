import * as cdk from "aws-cdk-lib";
import * as sqs from "aws-cdk-lib/aws-sqs";
import { Construct } from "constructs";

/**
 * SQSQueueConstruct のプロパティインターフェース
 */
export interface SQSQueueConstructProps {
  /** キュー名（オプション、未指定の場合は自動生成） */
  queueName?: string;

  /** 可視性タイムアウト（デフォルト: 300秒） */
  visibilityTimeout?: cdk.Duration;

  /** メッセージ保持期間（デフォルト: 4日） */
  retentionPeriod?: cdk.Duration;

  /** デッドレターキューの最大受信回数（デフォルト: 3） */
  maxReceiveCount?: number;

  /** デッドレターキューを有効にするか（デフォルト: true） */
  enableDeadLetterQueue?: boolean;

  /** 削除ポリシー（デフォルト: DESTROY） */
  removalPolicy?: cdk.RemovalPolicy;
}

/**
 * SQS キューとその設定を管理する再利用可能なコンストラクト
 *
 * このコンストラクトは以下の責任を持ちます：
 * - SQS キューの作成と基本設定の管理
 * - デッドレターキューの作成と設定
 * - 可視性タイムアウトとメッセージ保持期間の設定
 */
export class SQSQueueConstruct extends Construct {
  /** 作成されたメインキュー */
  public readonly queue: sqs.Queue;

  /** 作成されたデッドレターキュー（有効な場合） */
  public readonly deadLetterQueue?: sqs.Queue;

  constructor(scope: Construct, id: string, props?: SQSQueueConstructProps) {
    super(scope, id);

    // デフォルト値の設定
    const {
      queueName,
      visibilityTimeout = cdk.Duration.seconds(300),
      retentionPeriod = cdk.Duration.days(4),
      maxReceiveCount = 3,
      enableDeadLetterQueue = true,
      removalPolicy = cdk.RemovalPolicy.DESTROY,
    } = props || {};

    // デッドレターキューの作成（有効な場合）
    if (enableDeadLetterQueue) {
      this.deadLetterQueue = new sqs.Queue(this, "DeadLetterQueue", {
        queueName: queueName ? `${queueName}-dlq` : undefined,
        retentionPeriod: cdk.Duration.days(14), // DLQ は長めに保持
        removalPolicy,
      });

      // タグの追加
      cdk.Tags.of(this.deadLetterQueue).add("Component", "SQSDeadLetterQueue");
      cdk.Tags.of(this.deadLetterQueue).add("ManagedBy", "SQSQueueConstruct");
    }

    // メインキューの作成
    this.queue = new sqs.Queue(this, "Queue", {
      queueName,
      visibilityTimeout,
      retentionPeriod,
      deadLetterQueue: this.deadLetterQueue
        ? {
            queue: this.deadLetterQueue,
            maxReceiveCount,
          }
        : undefined,
      removalPolicy,
    });

    // タグの追加
    cdk.Tags.of(this.queue).add("Component", "SQSQueue");
    cdk.Tags.of(this.queue).add("ManagedBy", "SQSQueueConstruct");
  }

  /**
   * キューの ARN を取得
   * @returns キューの ARN
   */
  public get queueArn(): string {
    return this.queue.queueArn;
  }

  /**
   * キューの URL を取得
   * @returns キューの URL
   */
  public get queueUrl(): string {
    return this.queue.queueUrl;
  }

  /**
   * キュー名を取得
   * @returns キュー名
   */
  public get queueName(): string {
    return this.queue.queueName;
  }
}
