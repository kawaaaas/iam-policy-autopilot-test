import * as cdk from "aws-cdk-lib";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import { Construct } from "constructs";

/**
 * DynamoDBTableConstruct のプロパティインターフェース
 */
export interface DynamoDBTableConstructProps {
  /** テーブル名（オプション、未指定の場合は自動生成） */
  tableName?: string;

  /** パーティションキー名（デフォルト: messageId） */
  partitionKeyName?: string;

  /** パーティションキーの型（デフォルト: STRING） */
  partitionKeyType?: dynamodb.AttributeType;

  /** ソートキー名（オプション） */
  sortKeyName?: string;

  /** ソートキーの型（デフォルト: STRING） */
  sortKeyType?: dynamodb.AttributeType;

  /** 課金モード（デフォルト: PAY_PER_REQUEST） */
  billingMode?: dynamodb.BillingMode;

  /** 削除ポリシー（デフォルト: DESTROY） */
  removalPolicy?: cdk.RemovalPolicy;

  /** Point-in-Time Recovery を有効にするか（デフォルト: false） */
  pointInTimeRecovery?: boolean;
}

/**
 * DynamoDB テーブルとその設定を管理する再利用可能なコンストラクト
 *
 * このコンストラクトは以下の責任を持ちます：
 * - DynamoDB テーブルの作成と基本設定の管理
 * - パーティションキーとソートキーの設定
 * - 課金モードとスケーリング設定
 */
export class DynamoDBTableConstruct extends Construct {
  /** 作成された DynamoDB テーブル */
  public readonly table: dynamodb.Table;

  constructor(
    scope: Construct,
    id: string,
    props?: DynamoDBTableConstructProps
  ) {
    super(scope, id);

    // デフォルト値の設定
    const {
      tableName,
      partitionKeyName = "messageId",
      partitionKeyType = dynamodb.AttributeType.STRING,
      sortKeyName,
      sortKeyType = dynamodb.AttributeType.STRING,
      billingMode = dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy = cdk.RemovalPolicy.DESTROY,
      pointInTimeRecovery = false,
    } = props || {};

    // テーブル設定の構築
    const tableProps: dynamodb.TableProps = {
      tableName,
      partitionKey: {
        name: partitionKeyName,
        type: partitionKeyType,
      },
      sortKey: sortKeyName
        ? {
            name: sortKeyName,
            type: sortKeyType,
          }
        : undefined,
      billingMode,
      removalPolicy,
      pointInTimeRecovery,
    };

    // DynamoDB テーブルの作成
    this.table = new dynamodb.Table(this, "Table", tableProps);

    // タグの追加
    cdk.Tags.of(this.table).add("Component", "DynamoDBTable");
    cdk.Tags.of(this.table).add("ManagedBy", "DynamoDBTableConstruct");
  }

  /**
   * テーブルの ARN を取得
   * @returns テーブルの ARN
   */
  public get tableArn(): string {
    return this.table.tableArn;
  }

  /**
   * テーブル名を取得
   * @returns テーブル名
   */
  public get tableName(): string {
    return this.table.tableName;
  }
}
