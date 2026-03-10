#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { ExamforgeStack } from "../lib/examforge-stack";

const app = new cdk.App();

const envName = app.node.tryGetContext("env") || "dev";

new ExamforgeStack(app, `Examforge-${envName}`, {
  env: {
    region: "ap-south-1",
    account: process.env.CDK_DEFAULT_ACCOUNT,
  },
  description: `ExamForge ${envName} infrastructure stack`,
});
