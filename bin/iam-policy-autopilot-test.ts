#!/usr/bin/env node
import * as cdk from "aws-cdk-lib/core";
import { ComplexIamTestStack } from "../lib/complex-iam-test-stack";
import { SimpleIamTestStack } from "../lib/simple-iam-test-stack";
import { StandardIamTestStack } from "../lib/standard-iam-test-stack";

const app = new cdk.App();

// Simple 環境: S3 読み取りのみの Lambda 関数
new SimpleIamTestStack(app, "SimpleIamTestStack", {
  /* If you don't specify 'env', this stack will be environment-agnostic.
   * Account/Region-dependent features and context lookups will not work,
   * but a single synthesized template can be deployed anywhere. */
  /* Uncomment the next line to specialize this stack for the AWS Account
   * and Region that are implied by the current CLI configuration. */
  // env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
  /* Uncomment the next line if you know exactly what Account and Region you
   * want to deploy the stack to. */
  // env: { account: '123456789012', region: 'us-east-1' },
  /* For more information, see https://docs.aws.amazon.com/cdk/latest/guide/environments.html */
});

// Standard 環境: SQS → Lambda → DynamoDB の連携
new StandardIamTestStack(app, "StandardIamTestStack", {
  // 環境に依存しないスタック（任意のリージョンにデプロイ可能）
  // env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
});

// Complex 環境: Bedrock + KMS 暗号化 S3 + Secrets Manager + EventBridge の統合
new ComplexIamTestStack(app, "ComplexIamTestStack", {
  // Bedrock を使用するため、us-east-1 リージョンを推奨
  // env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: 'us-east-1' },
});
