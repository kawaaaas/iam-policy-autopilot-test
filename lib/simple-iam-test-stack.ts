import * as cdk from "aws-cdk-lib";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as s3 from "aws-cdk-lib/aws-s3";
import { Construct } from "constructs";
import { DataDeploymentConstruct } from "./constructs/data-deployment-construct";
import { IAMPermissionConstruct } from "./constructs/iam-permission-construct";
import { LambdaFunctionConstruct } from "./constructs/lambda-function-construct";
import { S3StorageConstruct } from "./constructs/s3-storage-construct";

export class SimpleIamTestStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // S3 ストレージコンストラクトの作成
    const s3Storage = new S3StorageConstruct(this, "S3Storage", {
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // データデプロイメントコンストラクトの作成
    const dataDeployment = new DataDeploymentConstruct(this, "DataDeployment", {
      targetBucket: s3Storage.bucket,
      sourcePath: "assets",
      prune: true,
    });

    // Lambda 関数コンストラクトの作成
    const lambdaFunction = new LambdaFunctionConstruct(this, "LambdaFunction", {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "index.handler",
      code: lambda.Code.fromAsset("lambda/simple-s3-reader"),
      environment: {
        BUCKET_NAME: s3Storage.bucket.bucketName,
      },
      timeout: cdk.Duration.seconds(30),
      memorySize: 128,
      description: "S3 から JSON ファイルを読み込む Lambda 関数",
    });

    // IAM 権限コンストラクトの作成
    new IAMPermissionConstruct(this, "IAMPermission", {
      lambdaFunction: lambdaFunction.function,
      s3Bucket: s3Storage.bucket,
      permissions: ["read"],
    });

    // 出力値の定義
    new cdk.CfnOutput(this, "BucketName", {
      value: s3Storage.bucket.bucketName,
      description: "作成された S3 バケット名",
    });

    new cdk.CfnOutput(this, "LambdaFunctionName", {
      value: lambdaFunction.functionName,
      description: "作成された Lambda 関数名",
    });

    new cdk.CfnOutput(this, "LambdaFunctionArn", {
      value: lambdaFunction.functionArn,
      description: "作成された Lambda 関数の ARN",
    });
  }
}
