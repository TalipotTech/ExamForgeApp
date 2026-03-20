import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as rds from "aws-cdk-lib/aws-rds";
import * as elasticache from "aws-cdk-lib/aws-elasticache";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as apprunner from "aws-cdk-lib/aws-apprunner";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as sns from "aws-cdk-lib/aws-sns";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as iam from "aws-cdk-lib/aws-iam";
import * as logs from "aws-cdk-lib/aws-logs";
import { Construct } from "constructs";

/**
 * ExamForge Infrastructure Stack
 *
 * Two-phase deployment:
 *   Phase A (foundation): VPC, RDS, ElastiCache, S3, ECR, Secrets, CloudWatch
 *     npx cdk deploy -c env=dev
 *   Phase B (services): App Runner + CloudFront (requires Docker images in ECR)
 *     npx cdk deploy -c env=dev -c imageTag=abc123 -c deployServices=true
 *
 * Region: ap-south-1 (Mumbai) - ALWAYS
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
    const deployServices = this.node.tryGetContext("deployServices") === "true";

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

    dbSg.addIngressRule(appSg, ec2.Port.tcp(5432), "App to PostgreSQL");
    cacheSg.addIngressRule(appSg, ec2.Port.tcp(6379), "App to Redis");

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
      removalPolicy: envName === "prod" ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    // ──── ElastiCache Redis 7 ────
    const cacheSubnetGroup = new elasticache.CfnSubnetGroup(this, "CacheSubnetGroup", {
      description: "ExamForge Redis subnet group",
      subnetIds: vpc.isolatedSubnets.map((s) => s.subnetId),
      cacheSubnetGroupName: `examforge-${envName}-cache`,
    });

    const redisCluster = new elasticache.CfnCacheCluster(this, "RedisCluster", {
      engine: "redis",
      engineVersion: "7.1",
      cacheNodeType: envName === "prod" ? "cache.t4g.small" : "cache.t4g.micro",
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
      removalPolicy: envName === "prod" ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
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
      secretRefs[name] = new secretsmanager.Secret(this, `Secret-${name}`, {
        secretName: `examforge/${envName}/${name}`,
        description: `ExamForge ${envName} - ${name}`,
      });
    }

    // Connection string secrets (managed outside CDK, referenced by name)
    secretRefs["database-url"] = secretsmanager.Secret.fromSecretNameV2(
      this,
      "ImportedDbUrl",
      `examforge/${envName}/app-database-url`,
    );
    secretRefs["redis-url"] = secretsmanager.Secret.fromSecretNameV2(
      this,
      "ImportedRedisUrl",
      `examforge/${envName}/app-redis-url`,
    );

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
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      alarmDescription: "RDS CPU > 80% for 10 minutes",
    }).addAlarmAction(new cdk.aws_cloudwatch_actions.SnsAction(alertsTopic));

    // ──── CloudWatch Log Groups ────
    new logs.LogGroup(this, "WebLogGroup", {
      logGroupName: `/apprunner/examforge-web-${envName}`,
      retention: envName === "prod" ? logs.RetentionDays.THREE_MONTHS : logs.RetentionDays.ONE_WEEK,
      removalPolicy: envName === "prod" ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    new logs.LogGroup(this, "ApiLogGroup", {
      logGroupName: `/apprunner/examforge-api-${envName}`,
      retention: envName === "prod" ? logs.RetentionDays.THREE_MONTHS : logs.RetentionDays.ONE_WEEK,
      removalPolicy: envName === "prod" ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    // ──── Foundation Outputs (always available) ────
    new cdk.CfnOutput(this, "VpcId", { value: vpc.vpcId });
    new cdk.CfnOutput(this, "DatabaseEndpoint", {
      value: database.dbInstanceEndpointAddress,
    });
    new cdk.CfnOutput(this, "RedisEndpoint", {
      value: redisCluster.attrRedisEndpointAddress,
    });
    new cdk.CfnOutput(this, "UploadsBucketName", {
      value: uploadsBucket.bucketName,
    });
    new cdk.CfnOutput(this, "WebEcrUri", { value: webRepo.repositoryUri });
    new cdk.CfnOutput(this, "ApiEcrUri", { value: apiRepo.repositoryUri });

    // ════════════════════════════════════════════════════════════════
    // Services layer: App Runner + CloudFront
    // Only deployed when -c deployServices=true (requires images in ECR)
    // ════════════════════════════════════════════════════════════════
    if (deployServices) {
      // ──── App Runner IAM Roles ────
      const appRunnerEcrAccessRole = new iam.Role(this, "AppRunnerEcrAccessRole", {
        assumedBy: new iam.ServicePrincipal("build.apprunner.amazonaws.com"),
        description: "Allows App Runner to pull images from ECR",
      });
      webRepo.grantPull(appRunnerEcrAccessRole);
      apiRepo.grantPull(appRunnerEcrAccessRole);

      const appRunnerInstanceRole = new iam.Role(this, "AppRunnerInstanceRole", {
        assumedBy: new iam.ServicePrincipal("tasks.apprunner.amazonaws.com"),
        description: "App Runner instance role - least privilege",
      });
      uploadsBucket.grantReadWrite(appRunnerInstanceRole);
      for (const secret of Object.values(secretRefs)) {
        secret.grantRead(appRunnerInstanceRole);
      }
      database.secret?.grantRead(appRunnerInstanceRole);

      // ──── App Runner VPC Connector ────
      const vpcConnector = new apprunner.CfnVpcConnector(this, "VpcConnector", {
        vpcConnectorName: `examforge-${envName}-vpc`,
        subnets: vpc.privateSubnets.map((s) => s.subnetId),
        securityGroups: [appSg.securityGroupId],
      });

      // ──── App Runner Auto-Scaling ────
      const autoScalingConfig = new apprunner.CfnAutoScalingConfiguration(
        this,
        "AutoScalingConfig",
        {
          autoScalingConfigurationName: `examforge-${envName}-scaling`,
          maxConcurrency: 50,
          maxSize: envName === "prod" ? 4 : 2,
          minSize: 1,
        },
      );

      // ──── App Runner: Web (Next.js) ────
      const webService = new apprunner.CfnService(this, "WebService", {
        serviceName: `examforge-web-${envName}`,
        sourceConfiguration: {
          authenticationConfiguration: {
            accessRoleArn: appRunnerEcrAccessRole.roleArn,
          },
          imageRepository: {
            imageIdentifier: `${webRepo.repositoryUri}:${imageTag}`,
            imageRepositoryType: "ECR",
            imageConfiguration: {
              port: "3000",
              runtimeEnvironmentVariables: [
                { name: "NODE_ENV", value: envName === "prod" ? "production" : "development" },
                {
                  name: "NEXT_PUBLIC_API_URL",
                  value:
                    envName === "prod"
                      ? "https://api.examforge.in"
                      : "https://bkxwda6tmj.ap-south-1.awsapprunner.com",
                },
                {
                  name: "NEXTAUTH_URL",
                  value: envName === "prod" ? "https://examforge.in" : "https://ice.ensate.in",
                },
                { name: "AUTH_TRUST_HOST", value: "true" },
                { name: "HOSTNAME", value: "0.0.0.0" },
              ],
              runtimeEnvironmentSecrets: [
                { name: "DATABASE_URL", value: secretRefs["database-url"]!.secretArn },
                { name: "NEXTAUTH_SECRET", value: secretRefs["nextauth-secret"]!.secretArn },
              ],
            },
          },
        },
        instanceConfiguration: {
          cpu: "1024",
          memory: "2048",
          instanceRoleArn: appRunnerInstanceRole.roleArn,
        },
        autoScalingConfigurationArn: autoScalingConfig.attrAutoScalingConfigurationArn,
        networkConfiguration: {
          egressConfiguration: {
            egressType: "VPC",
            vpcConnectorArn: vpcConnector.attrVpcConnectorArn,
          },
        },
        healthCheckConfiguration: {
          protocol: "HTTP",
          path: "/api/health",
          interval: 10,
          timeout: 5,
          healthyThreshold: 1,
          unhealthyThreshold: 5,
        },
      });
      webService.addDependency(vpcConnector);

      // ──── App Runner: API (Fastify) ────
      const apiService = new apprunner.CfnService(this, "ApiService", {
        serviceName: `examforge-api-${envName}`,
        sourceConfiguration: {
          authenticationConfiguration: {
            accessRoleArn: appRunnerEcrAccessRole.roleArn,
          },
          imageRepository: {
            imageIdentifier: `${apiRepo.repositoryUri}:${imageTag}`,
            imageRepositoryType: "ECR",
            imageConfiguration: {
              port: "4000",
              runtimeEnvironmentVariables: [
                { name: "NODE_ENV", value: envName === "prod" ? "production" : "development" },
                { name: "S3_BUCKET", value: uploadsBucket.bucketName },
                { name: "AWS_REGION", value: "ap-south-1" },
              ],
              runtimeEnvironmentSecrets: [
                { name: "DATABASE_URL", value: secretRefs["database-url"]!.secretArn },
                { name: "REDIS_URL", value: secretRefs["redis-url"]!.secretArn },
                { name: "ANTHROPIC_API_KEY", value: secretRefs["anthropic-api-key"]!.secretArn },
                { name: "OPENAI_API_KEY", value: secretRefs["openai-api-key"]!.secretArn },
                {
                  name: "GOOGLE_GENERATIVE_AI_API_KEY",
                  value: secretRefs["gemini-api-key"]!.secretArn,
                },
                { name: "MISTRAL_API_KEY", value: secretRefs["mistral-api-key"]!.secretArn },
                { name: "NEXTAUTH_SECRET", value: secretRefs["nextauth-secret"]!.secretArn },
              ],
            },
          },
        },
        instanceConfiguration: {
          cpu: "1024",
          memory: "2048",
          instanceRoleArn: appRunnerInstanceRole.roleArn,
        },
        autoScalingConfigurationArn: autoScalingConfig.attrAutoScalingConfigurationArn,
        networkConfiguration: {
          egressConfiguration: {
            egressType: "VPC",
            vpcConnectorArn: vpcConnector.attrVpcConnectorArn,
          },
        },
        healthCheckConfiguration: {
          protocol: "HTTP",
          path: "/health",
          interval: 10,
          timeout: 5,
          healthyThreshold: 1,
          unhealthyThreshold: 3,
        },
      });
      apiService.addDependency(vpcConnector);

      // ──── CloudFront Distribution ────
      const s3Origin = origins.S3BucketOrigin.withOriginAccessControl(uploadsBucket);

      const distribution = new cloudfront.Distribution(this, "CdnDistribution", {
        comment: `ExamForge ${envName} CDN`,
        priceClass: cloudfront.PriceClass.PRICE_CLASS_200,
        defaultBehavior: {
          origin: new origins.HttpOrigin(webService.attrServiceUrl, {
            protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
          }),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
        },
        additionalBehaviors: {
          "/api/*": {
            origin: new origins.HttpOrigin(apiService.attrServiceUrl, {
              protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
            }),
            viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
            cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
            originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER,
            allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          },
          "/uploads/*": {
            origin: s3Origin,
            viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
            cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
          },
          "/_next/static/*": {
            origin: new origins.HttpOrigin(webService.attrServiceUrl, {
              protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
            }),
            viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
            cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
          },
        },
      });

      // ──── App Runner CloudWatch Alarms ────
      new cloudwatch.Alarm(this, "ApiMemoryAlarm", {
        metric: new cloudwatch.Metric({
          namespace: "AWS/AppRunner",
          metricName: "MemoryUtilization",
          dimensionsMap: { ServiceName: `examforge-api-${envName}` },
          period: cdk.Duration.minutes(5),
          statistic: "Average",
        }),
        threshold: 85,
        evaluationPeriods: 2,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
        alarmDescription: "API memory > 85% for 10 minutes",
      }).addAlarmAction(new cdk.aws_cloudwatch_actions.SnsAction(alertsTopic));

      new cloudwatch.Alarm(this, "Api5xxAlarm", {
        metric: new cloudwatch.Metric({
          namespace: "AWS/AppRunner",
          metricName: "5xxStatusResponses",
          dimensionsMap: { ServiceName: `examforge-api-${envName}` },
          period: cdk.Duration.minutes(5),
          statistic: "Sum",
        }),
        threshold: 5,
        evaluationPeriods: 1,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
        alarmDescription: "API 5xx > 5 in 5 minutes",
      }).addAlarmAction(new cdk.aws_cloudwatch_actions.SnsAction(alertsTopic));

      // ──── Service Outputs ────
      new cdk.CfnOutput(this, "WebServiceUrl", {
        value: `https://${webService.attrServiceUrl}`,
      });
      new cdk.CfnOutput(this, "ApiServiceUrl", {
        value: `https://${apiService.attrServiceUrl}`,
      });
      new cdk.CfnOutput(this, "CloudFrontDomain", {
        value: distribution.distributionDomainName,
      });
      new cdk.CfnOutput(this, "CloudFrontDistributionId", {
        value: distribution.distributionId,
      });
    }

    // TODO Phase 2: Replace App Runner with ECS Fargate service
    // TODO Phase 2: Add Python AI microservice as separate ECS task
    // TODO Phase 3: Evaluate Aurora Serverless v2 upgrade
  }
}
