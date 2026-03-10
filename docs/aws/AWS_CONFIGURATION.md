# AWS Configuration & Startup Credits Optimization Guide

## Overview

This guide documents how to configure AWS for ExamForge, optimized for
maximum value from AWS Startups credits ($5K–$100K). Every service choice
prioritizes the Mumbai (ap-south-1) region for DPDPA compliance and
low-latency access for Indian users.

---

## 1. Account Setup & Credits Activation

### Step 1: Apply for AWS Activate

Apply at: https://aws.amazon.com/activate/

ExamForge qualifies under the **Portfolio** tier (up to $100K credits)
if accepted into an accelerator, or **Founders** tier ($1K–$5K) for
self-funded startups.

**Application tips for ExamForge:**
- Emphasize the healthcare/education vertical (AWS prioritizes these)
- Mention ABDM/ABHA integration plans (government health tech alignment)
- Highlight AI workload (AWS wants AI startups on their platform)
- Reference the India market (AWS is expanding ap-south-1 aggressively)

### Step 2: Enable Cost Controls Immediately

```bash
# Enable AWS Budgets (free — always set this first)
aws budgets create-budget \
  --account-id YOUR_ACCOUNT_ID \
  --budget '{
    "BudgetName": "ExamForge-Monthly",
    "BudgetLimit": {"Amount": "150", "Unit": "USD"},
    "TimeUnit": "MONTHLY",
    "BudgetType": "COST"
  }' \
  --notifications-with-subscribers '[{
    "Notification": {
      "NotificationType": "ACTUAL",
      "ComparisonOperator": "GREATER_THAN",
      "Threshold": 80,
      "ThresholdType": "PERCENTAGE"
    },
    "Subscribers": [{
      "SubscriptionType": "EMAIL",
      "Address": "alerts@examforge.in"
    }]
  }]'
```

**Critical alerts to set:**
- 50% of monthly budget consumed
- 80% of monthly budget consumed
- 100% of monthly budget consumed
- Any single-day spend > $20 (catches runaway instances)

### Step 3: Enable AWS Cost Explorer

```bash
aws ce update-cost-allocation-tags \
  --cost-allocation-tags-status \
    TagKey=project,Status=Active \
    TagKey=environment,Status=Active \
    TagKey=service,Status=Active
```

Tag EVERYTHING with: `project=examforge`, `environment=dev|staging|prod`,
`service=web|api|ai|scraper|db`.

---

## 2. Phase 1 Infrastructure (MVP — Months 1–3)

### Estimated Monthly Cost: $80–120 (covered by credits)

| Service             | Config                           | Est. Cost/mo |
|---------------------|----------------------------------|-------------|
| App Runner (web)    | 1 vCPU, 2GB RAM, auto-scale 1–4 | $15–30      |
| App Runner (api)    | 1 vCPU, 2GB RAM, auto-scale 1–4 | $15–30      |
| RDS PostgreSQL      | db.t4g.micro, 20GB gp3, single-AZ | $15        |
| ElastiCache Redis   | cache.t4g.micro, single-AZ       | $12         |
| S3                  | Standard, ~50GB                  | $1–2        |
| CloudFront          | 100GB transfer/mo                | $8–10       |
| ECR                 | ~5GB images                      | $0.50       |
| Secrets Manager     | 10 secrets                       | $4          |
| CloudWatch          | Basic monitoring                 | $5–10       |
| **Total**           |                                  | **$76–114** |

### App Runner Configuration

```bash
# Create App Runner service (web)
aws apprunner create-service \
  --service-name examforge-web-dev \
  --source-configuration '{
    "AuthenticationConfiguration": {
      "AccessRoleArn": "arn:aws:iam::role/AppRunnerECRAccess"
    },
    "ImageRepository": {
      "ImageIdentifier": "ACCOUNT.dkr.ecr.ap-south-1.amazonaws.com/examforge-web:latest",
      "ImageRepositoryType": "ECR",
      "ImageConfiguration": {
        "Port": "3000",
        "RuntimeEnvironmentSecrets": {
          "DATABASE_URL": "arn:aws:secretsmanager:ap-south-1:ACCOUNT:secret:examforge/db-url",
          "NEXTAUTH_SECRET": "arn:aws:secretsmanager:ap-south-1:ACCOUNT:secret:examforge/auth"
        }
      }
    }
  }' \
  --instance-configuration '{
    "Cpu": "1024",
    "Memory": "2048",
    "InstanceRoleArn": "arn:aws:iam::role/AppRunnerInstanceRole"
  }' \
  --auto-scaling-configuration-arn "arn:aws:apprunner:ap-south-1:ACCOUNT:autoscalingconfiguration/examforge-scaling" \
  --network-configuration '{
    "EgressConfiguration": {
      "EgressType": "VPC",
      "VpcConnectorArn": "arn:aws:apprunner:ap-south-1:ACCOUNT:vpcconnector/examforge-vpc"
    }
  }' \
  --region ap-south-1
```

**Key settings:**
- VPC Connector: REQUIRED for private RDS/ElastiCache access
- Auto-scaling: min=1, max=4, concurrency=50 (scale on concurrent requests)
- Scale-to-zero NOT recommended for prod (cold start = 5–10s)

### RDS PostgreSQL Configuration

```bash
aws rds create-db-instance \
  --db-instance-identifier examforge-dev \
  --db-instance-class db.t4g.micro \
  --engine postgres \
  --engine-version "17.2" \
  --master-username examforge_admin \
  --manage-master-user-password \
  --allocated-storage 20 \
  --storage-type gp3 \
  --vpc-security-group-ids sg-xxxxx \
  --db-subnet-group-name examforge-db-subnet \
  --backup-retention-period 7 \
  --preferred-backup-window "03:00-04:00" \
  --no-publicly-accessible \
  --storage-encrypted \
  --region ap-south-1
```

**After creation, enable pgvector:**
```sql
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm; -- for fuzzy text search
```

### ElastiCache Redis Configuration

```bash
aws elasticache create-cache-cluster \
  --cache-cluster-id examforge-redis-dev \
  --engine redis \
  --engine-version "7.1" \
  --cache-node-type cache.t4g.micro \
  --num-cache-nodes 1 \
  --cache-subnet-group-name examforge-cache-subnet \
  --security-group-ids sg-xxxxx \
  --region ap-south-1
```

### S3 + CloudFront Setup

```bash
# Create uploads bucket
aws s3 mb s3://examforge-uploads-dev --region ap-south-1

# Enable versioning (protects against accidental deletes)
aws s3api put-bucket-versioning \
  --bucket examforge-uploads-dev \
  --versioning-configuration Status=Enabled

# Lifecycle rule: move old uploads to Infrequent Access after 90 days
aws s3api put-bucket-lifecycle-configuration \
  --bucket examforge-uploads-dev \
  --lifecycle-configuration '{
    "Rules": [{
      "ID": "MoveToIA",
      "Status": "Enabled",
      "Transitions": [{
        "Days": 90,
        "StorageClass": "STANDARD_IA"
      }],
      "Filter": {"Prefix": "uploads/"}
    }]
  }'
```

**CloudFront distribution:**
- Origin: S3 bucket + App Runner (web)
- Cache policy: CachingOptimized for static assets
- Price class: PriceClass_200 (includes India edge locations)
- Custom domain: cdn.examforge.in with ACM certificate

---

## 3. Phase 2 Scaling (Months 4–8)

### Estimated Monthly Cost: $250–600 (still on credits)

**Changes from Phase 1 (NO migration — just upgrades):**

| Upgrade                        | From → To                       | Cost Delta |
|--------------------------------|----------------------------------|-----------|
| RDS instance                   | db.t4g.micro → db.t4g.medium    | +$45/mo   |
| RDS read replica               | None → 1x db.t4g.micro          | +$15/mo   |
| ElastiCache                    | cache.t4g.micro → cache.t4g.small | +$12/mo |
| App Runner → ECS Fargate       | Same containers, more control    | ~same     |
| Add Python AI service (Fargate)| 0.5 vCPU, 1GB                   | +$15/mo   |
| S3 storage growth              | 50GB → 200GB                    | +$3/mo    |
| CloudFront transfer            | 100GB → 500GB/mo                | +$40/mo   |
| SQS queues (scraping)          | New                              | +$1/mo    |

### ECS Fargate Migration from App Runner

This is a configuration change, not a rewrite. Same Docker images, same ECR:

```bash
# Register task definition (uses same image from ECR)
aws ecs register-task-definition \
  --family examforge-api \
  --network-mode awsvpc \
  --requires-compatibilities FARGATE \
  --cpu "512" \
  --memory "1024" \
  --container-definitions '[{
    "name": "api",
    "image": "ACCOUNT.dkr.ecr.ap-south-1.amazonaws.com/examforge-api:latest",
    "portMappings": [{"containerPort": 4000}],
    "logConfiguration": {
      "logDriver": "awslogs",
      "options": {
        "awslogs-group": "/ecs/examforge-api",
        "awslogs-region": "ap-south-1",
        "awslogs-stream-prefix": "ecs"
      }
    },
    "secrets": [
      {"name": "DATABASE_URL", "valueFrom": "arn:aws:secretsmanager:ap-south-1:ACCOUNT:secret:examforge/db-url"},
      {"name": "REDIS_URL", "valueFrom": "arn:aws:secretsmanager:ap-south-1:ACCOUNT:secret:examforge/redis-url"},
      {"name": "ANTHROPIC_API_KEY", "valueFrom": "arn:aws:secretsmanager:ap-south-1:ACCOUNT:secret:examforge/anthropic-key"}
    ]
  }]'
```

---

## 4. Phase 3 Scaling (Months 9–18)

### Estimated Monthly Cost: $800–3,000

| Upgrade                              | Cost Impact       |
|--------------------------------------|------------------|
| Aurora PostgreSQL Serverless v2       | $100–400/mo      |
| ElastiCache Redis cluster (3 nodes)  | $100/mo          |
| ECS or EKS (multi-service)           | $200–600/mo      |
| CloudFront (2TB+/mo)                 | $150–300/mo      |
| WAF + Shield Standard                | $10/mo           |
| SageMaker (ML inference endpoints)   | $100–400/mo      |

---

## 5. Credits Optimization Strategies

### High-Impact Credit Savings

**1. Use Spot Instances for batch AI processing**
ECS Fargate Spot: 70% discount for interruptible workloads.
Perfect for: scraping jobs, bulk question generation, video processing.
```bash
# In task definition, set capacity provider to FARGATE_SPOT
aws ecs create-service \
  --capacity-provider-strategy '[
    {"capacityProvider": "FARGATE", "weight": 1, "base": 1},
    {"capacityProvider": "FARGATE_SPOT", "weight": 3}
  ]'
```
This runs 75% of tasks on Spot (70% cheaper) with 25% on regular Fargate
as baseline.

**2. Reserved Instances for RDS (Phase 2+)**
After 6 months of stable usage, buy 1-year RI for RDS:
- db.t4g.medium: ~$45/mo on-demand → ~$28/mo reserved (38% savings)
- Pay upfront with credits for maximum discount

**3. S3 Intelligent-Tiering**
```bash
aws s3api put-bucket-intelligent-tiering-configuration \
  --bucket examforge-uploads-prod \
  --id "AutoTier" \
  --intelligent-tiering-configuration '{
    "Id": "AutoTier",
    "Status": "Enabled",
    "Tierings": [
      {"AccessTier": "ARCHIVE_ACCESS", "Days": 90},
      {"AccessTier": "DEEP_ARCHIVE_ACCESS", "Days": 180}
    ]
  }'
```
Old question papers and uploaded videos automatically move to cheaper
storage tiers. Saves 60–95% on storage costs for rarely-accessed content.

**4. CloudFront caching to reduce S3 costs**
Cache static assets (question images, PDFs) aggressively:
- TTL: 86400s (24 hours) for uploaded content
- TTL: 31536000s (1 year) for static assets (_next/static/)
This reduces S3 GET requests by 90%+.

**5. Use AWS Batch for heavy AI workloads**
For bulk question generation runs (1000+ questions), use AWS Batch
instead of always-on ECS. Batch provisions compute only when needed
and terminates when done — zero cost when idle.

### Credits Burn Rate Monitoring

```bash
# Weekly credits check script (add to cron)
aws ce get-cost-and-usage \
  --time-period Start=$(date -d '-7 days' +%Y-%m-%d),End=$(date +%Y-%m-%d) \
  --granularity DAILY \
  --metrics BlendedCost \
  --group-by Type=TAG,Key=service \
  --region us-east-1
```

**Target burn rates:**
- Phase 1: $80–120/mo = $960–1,440/year
- Phase 2: $250–600/mo = $3,000–7,200/year
- With $25K credits: ~2+ years of Phase 1, or ~1.5 years through Phase 2

---

## 6. Security Configuration

### IAM Roles (Principle of Least Privilege)

```
examforge-app-runner-role
  ├── ecr:GetDownloadUrlForLayer (pull images)
  ├── secretsmanager:GetSecretValue (app secrets only)
  ├── s3:PutObject, s3:GetObject (uploads bucket only)
  └── logs:PutLogEvents (CloudWatch)

examforge-ecs-task-role
  ├── (all above)
  ├── sqs:SendMessage, sqs:ReceiveMessage (job queues)
  └── bedrock:InvokeModel (if using Bedrock later)

examforge-ci-deploy-role
  ├── ecr:PutImage
  ├── apprunner:UpdateService
  ├── ecs:UpdateService
  └── cloudformation:* (CDK deployments)
```

### VPC Architecture

```
VPC: 10.0.0.0/16
├── Public Subnets (2 AZs): 10.0.1.0/24, 10.0.2.0/24
│   └── NAT Gateway, ALB (Phase 2+)
├── Private Subnets (2 AZs): 10.0.10.0/24, 10.0.11.0/24
│   └── App Runner VPC Connector, ECS tasks
└── Isolated Subnets (2 AZs): 10.0.20.0/24, 10.0.21.0/24
    └── RDS, ElastiCache (no internet access)
```

### Secrets Manager Structure

```
examforge/dev/database-url
examforge/dev/redis-url
examforge/dev/nextauth-secret
examforge/dev/anthropic-api-key
examforge/dev/openai-api-key
examforge/dev/gemini-api-key
examforge/dev/mistral-api-key
examforge/dev/razorpay-key-id
examforge/dev/razorpay-key-secret
examforge/dev/msg91-auth-key
```

Replace `dev` with `staging` or `prod` for other environments.
Cost: $0.40/secret/month = ~$4/mo for 10 secrets.

---

## 7. Monitoring & Alerting

### CloudWatch Alarms (set up on day one)

```bash
# RDS CPU > 80%
aws cloudwatch put-metric-alarm \
  --alarm-name "examforge-rds-cpu-high" \
  --metric-name CPUUtilization \
  --namespace AWS/RDS \
  --statistic Average \
  --period 300 \
  --threshold 80 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 2 \
  --alarm-actions "arn:aws:sns:ap-south-1:ACCOUNT:examforge-alerts"

# Redis memory > 70%
aws cloudwatch put-metric-alarm \
  --alarm-name "examforge-redis-memory-high" \
  --metric-name DatabaseMemoryUsagePercentage \
  --namespace AWS/ElastiCache \
  --threshold 70 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 2 \
  --alarm-actions "arn:aws:sns:ap-south-1:ACCOUNT:examforge-alerts"

# App Runner 5xx errors > 5 in 5 minutes
aws cloudwatch put-metric-alarm \
  --alarm-name "examforge-api-5xx" \
  --metric-name 5xxStatusResponses \
  --namespace AWS/AppRunner \
  --threshold 5 \
  --comparison-operator GreaterThanThreshold \
  --period 300 \
  --alarm-actions "arn:aws:sns:ap-south-1:ACCOUNT:examforge-alerts"
```

### Custom Metrics to Track

- `ai.api.cost_usd` — daily AI spend by provider
- `ai.api.latency_ms` — P50, P95, P99 by provider
- `exam.sessions.active` — concurrent exam takers
- `scraper.questions.extracted` — daily scrape yield
- `questions.total` — total questions in bank by exam
