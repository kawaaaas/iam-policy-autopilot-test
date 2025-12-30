import * as cdk from "aws-cdk-lib";
import * as events from "aws-cdk-lib/aws-events";
import * as iam from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";

/**
 * EventBridge コンストラクトのプロパティ
 */
export interface EventBridgeConstructProps {
  /**
   * イベントバス名
   */
  readonly eventBusName: string;

  /**
   * イベントバスの説明（オプション）
   */
  readonly description?: string;

  /**
   * 削除ポリシー
   * @default cdk.RemovalPolicy.DESTROY
   */
  readonly removalPolicy?: cdk.RemovalPolicy;
}

/**
 * EventBridge コンストラクト
 *
 * カスタム EventBridge イベントバスを作成し、設定を管理する再利用可能なコンストラクトです。
 * デフォルトのイベントバスとは独立して動作します。
 */
export class EventBridgeConstruct extends Construct {
  /**
   * 作成された EventBridge イベントバス
   */
  public readonly eventBus: events.EventBus;

  /**
   * イベントバスの ARN
   */
  public readonly eventBusArn: string;

  /**
   * イベントバス名
   */
  public readonly eventBusName: string;

  constructor(scope: Construct, id: string, props: EventBridgeConstructProps) {
    super(scope, id);

    // カスタムイベントバスの作成
    this.eventBus = new events.EventBus(this, "EventBus", {
      eventBusName: props.eventBusName,
      description: props.description,
    });

    // 削除ポリシーの適用
    this.eventBus.applyRemovalPolicy(
      props.removalPolicy ?? cdk.RemovalPolicy.DESTROY
    );

    // プロパティの設定
    this.eventBusArn = this.eventBus.eventBusArn;
    this.eventBusName = this.eventBus.eventBusName;
  }

  /**
   * 指定されたプリンシパルにイベント送信権限を付与
   */
  public grantPutEventsTo(grantee: iam.IGrantable): iam.Grant {
    return this.eventBus.grantPutEventsTo(grantee);
  }
}
