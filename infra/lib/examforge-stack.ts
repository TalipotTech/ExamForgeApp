import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as rds from "aws-cdk-lib/aws-rds";
import * as elasticache from "aws-cdk-lib/aws-elasticache";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as apprunner from "aws-cdk-lib/aws-apprunner";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as sns from "aws-cdk-lib/aws-sns";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import { Construct } from "constructs";

/**
 * ExamForge Infrastructure Stack
 *
 * Phase 1: App Runner + RDS + ElastiCache + S3 + CloudFront
 * Phase 2: Swap App Runner → ECS Fargate (same containers, more control)
 * Phase 3: ECS Fargate → EKS if needed + Aurora Serverless v2
 *
 * Region: ap-south-1 (Mumbai) — ALWAYS
 *
 * Usage:
 *   npx cdk deploy -c env=dev -c imageTag=abc123
 *   npx cdk deploy -c env=prod -c imageTag=abc123
 */
export class ExamforgeStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, {
      ...props,
      env: {
        region: "ap-south-1",
        account: process.env.CDK_DEFAULT_ACCOUNT,
      },
    });

    const envName = this.node.tryGetContext("env") || "dev";
    const imageTag = this.node.tryGetContext("imageTag") || "latest";

    // Tags applied to ALL resources in this stack
    cdk.Tags.of(this).add("project", "examforge");
    cdk.Tags.of(this).add("environment", envName);
    cdk.Tags.of(this).add("managed-by", "cdk");

    // ──── VPC ────
    const vpc = new ec2.Vpc(this, "ExamforgeVpc", {
      maxAzs: 2,
      natGateways: envName === "prod" ? 2 : 1,
      subnetConfiguration: [
        { name: "public", subnetType: ec2.SubnetType.PUBLIC, cidrMask: 24 },
        { name: "private", subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS, cidrMask: 24 },
        { name: "isolated", subnetType: ec2.SubnetType.PRIVATE_ISOLATED, cidrMask: 24 },
      ],
    });

    // ──── Security Groups ────
    const dbSg = new ec2.SecurityGroup(this, "DbSg", {
      vpc,
      description: "RDS PostgreSQL",
      allowAllOutbound: false,
    });

    const cacheSg = new ec2.SecurityGroup(this, "CacheSg", {
      vpc,
      description: "ElastiCache Redis",
      allowAllOutbound: false,
    });

    const appSg = new ec2.SecurityGroup(this, "AppSg", {
      vpc,
      description: "Application containers",
      allowAllOutbound: true,
    });

    dbSg.addIngressRule(appSg, ec2.Port.tcp(5432), "App → PostgreSQL");
    cacheSg.addIngressRule(appSg, ec2.Port.tcp(6379), "App → Redis");

    // ──── RDS PostgreSQL 17 ────
    const dbInstanceClass =
      envName === "prod"
        ? ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.MEDIUM)
        : ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.MICRO);

    const database = new rds.DatabaseInstance(this, "ExamforgeDb", {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_17,
      }),
      instanceType: dbInstanceClass,
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [dbSg],
      databaseName: `examforge_${envName}`,
      credentials: rds.Credentials.fromGeneratedSecret("examforge_admin", {
        secretName: `examforge/${envName}/database-credentials`,
      }),
      storageEncrypted: true,
      allocatedStorage: envName === "prod" ? 50 : 20,
      backupRetention: cdk.Duration.days(envName === "prod" ? 14 : 7),
      deletionProtection: envName === "prod",
      removalPolicy:
        envName === "prod"
          ? cdk.RemovalPolicy.RETAIN
          : cdk.RemovalPolicy.DESTROY,
    });

    // ──── ElastiCache Redis 7 ────
    const cacheSubnetGroup = new elasticache.CfnSubnetGroup(
      this,
      "CacheSubnetGroup",
      {
        description: "ExamForge Redis subnet group",
        subnetIds: vpc.isolatedSubnets.map((s) => s.subnetId),
        cacheSubnetGroupName: `examforge-${envName}-cache`,
      }
    );

    const redisCluster = new elasticache.CfnCacheCluster(this, "RedisCluster", {
      engine: "redis",
      engineVersion: "7.1",
      cacheNodeType:
        envName === "prod" ? "cache.t4g.small" : "cache.t4g.micro",
      numCacheNodes: 1,
      cacheSubnetGroupName: cacheSubnetGroup.cacheSubnetGroupName,
      vpcSecurityGroupIds: [cacheSg.securityGroupId],
      clusterName: `examforge-${envName}`,
    });

    // ──── S3 Bucket ────
    const uploadsBucket = new s3.Bucket(this, "UploadsBucket", {
      bucketName: `examforge-uploads-${envName}`,
      versioned: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      lifecycleRules: [
        {
          id: "MoveToIA",
          transitions: [
            {
              storageClass: s3.StorageClass.INFREQUENT_ACCESS,
              transitionAfter: cdk.Duration.days(90),
            },
          ],
        },
      ],
      removalPolicy:
        envName === "prod"
          ? cdk.RemovalPolicy.RETAIN
          : cdk.RemovalPolicy.DESTROY,
    });

    // ──── ECR Repositories ────
    const webRepo = new ecr.Repository(this, "WebRepo", {
      repositoryName: "examforge-web",
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      lifecycleRules: [{ maxImageCount: 10 }],
    });

    const apiRepo = new ecr.Repository(this, "ApiRepo", {
      repositoryName: "examforge-api",
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      lifecycleRules: [{ maxImageCount: 10 }],
    });

    // ──── Secrets Manager ────
    const secrets = [
      "anthropic-api-key",
      "openai-api-key",
      "gemini-api-key",
      "mistral-api-key",
      "razorpay-key-id",
      "razorpay-key-secret",
      "nextauth-secret",
      "msg91-auth-key",
    ];

    const secretRefs: Record<string, secretsmanager.ISecret> = {};
    for (const name of secrets) {
      secretRefs[name] = new secretsmanager.Secret(
        this,
        `Secret-${name}`,
        {
          secretName: `examforge/${envName}/${name}`,
          description: `ExamForge ${envName} - ${name}`,
        }
      );
    }

    // ──── SNS Alerts ────
    const alertsTopic = new sns.Topic(this, "AlertsTopic", {
      topicName: `examforge-${envName}-alerts`,
      displayName: `ExamForge ${envName} Alerts`,
    });

    // ──── CloudWatch Alarms ────
    new cloudwatch.Alarm(this, "RdsCpuAlarm", {
      metric: database.metricCPUUtilization({ period: cdk.Duration.minutes(5) }),
      threshold: 80,
      evaluationPeriods: 2,
      comparisonOperator:
        cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      alarmDescription: "RDS CPU > 80% for 10 minutes",
    }).addAlarmAction(
      new cdk.aws_cloudwatch_actions.SnsAction(alertsTopic)
    );

    // ──── Outputs ────
    new cdk.CfnOutput(this, "VpcId", { value: vpc.vpcId });
    new cdk.CfnOutput(this, "DatabaseEndpoint", {
      value: database.dbInstanceEndpointAddress,
    });
    new cdk.CfnOutput(this, "UploadsBucketName", {
      value: uploadsBucket.bucketName,
    });
    new cdk.CfnOutput(this, "WebEcrUri", { value: webRepo.repositoryUri });
    new cdk.CfnOutput(this, "ApiEcrUri", { value: apiRepo.repositoryUri });

    // TODO Phase 1: Add App Runner services with VPC connector
    // TODO Phase 1: Add CloudFront distribution
    // TODO Phase 2: Replace App Runner with ECS Fargate service
    // TODO Phase 2: Add Python AI microservice as separate ECS task
    // TODO Phase 3: Evaluate Aurora Serverless v2 upgrade
  }
}
