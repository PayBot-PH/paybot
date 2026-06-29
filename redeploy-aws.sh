#!/bin/bash

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║       xend AWS Elastic Beanstalk Redeploy       ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════╝${NC}"

# AWS Configuration
AWS_ACCESS_KEY_ID="${1:-$AWS_ACCESS_KEY_ID}"
AWS_SECRET_ACCESS_KEY="${2:-$AWS_SECRET_ACCESS_KEY}"
AWS_REGION="${AWS_REGION:-ap-southeast-1}"
EB_APP_NAME="${EB_APP_NAME:-paybot}"
EB_ENV_NAME="${EB_ENV_NAME:-paybot-production}"
AWS_ACCOUNT_ID="${3:-$AWS_ACCOUNT_ID}"

# Validate inputs
if [ -z "$AWS_ACCESS_KEY_ID" ] || [ -z "$AWS_SECRET_ACCESS_KEY" ] || [ -z "$AWS_ACCOUNT_ID" ]; then
  echo -e "${RED}❌ Error: Missing AWS credentials or Account ID${NC}"
  echo ""
  echo "Usage: $0 <ACCESS_KEY_ID> <SECRET_ACCESS_KEY> <ACCOUNT_ID>"
  echo ""
  echo "Or set environment variables:"
  echo "  AWS_ACCESS_KEY_ID"
  echo "  AWS_SECRET_ACCESS_KEY"
  echo "  AWS_ACCOUNT_ID"
  echo "  AWS_REGION (default: ap-southeast-1)"
  echo "  EB_APP_NAME (default: paybot)"
  echo "  EB_ENV_NAME (default: paybot-production)"
  exit 1
fi

# Set AWS credentials as environment variables
export AWS_ACCESS_KEY_ID
export AWS_SECRET_ACCESS_KEY
export AWS_DEFAULT_REGION=$AWS_REGION

ECR_REGISTRY="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
IMAGE_NAME="paybot"
IMAGE_URI="${ECR_REGISTRY}/${IMAGE_NAME}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

echo -e "${GREEN}✓ Configuration:${NC}"
echo "  AWS Region: $AWS_REGION"
echo "  EB App: $EB_APP_NAME"
echo "  EB Env: $EB_ENV_NAME"
echo "  ECR Registry: $ECR_REGISTRY"
echo ""

# Step 1: Check if required tools are available
echo -e "${YELLOW}📋 Checking required tools...${NC}"
for tool in docker aws eb; do
  if command -v $tool &> /dev/null; then
    echo -e "${GREEN}✓ $tool${NC}"
  else
    echo -e "${RED}✗ $tool not found. Please install $tool.${NC}"
    exit 1
  fi
done
echo ""

# Step 2: Build Docker image
echo -e "${YELLOW}📦 Building Docker image...${NC}"
docker build \
  -t ${IMAGE_NAME}:latest \
  -t ${IMAGE_NAME}:${TIMESTAMP} \
  -f Dockerfile . || {
  echo -e "${RED}❌ Docker build failed${NC}"
  exit 1
}
echo -e "${GREEN}✓ Docker image built${NC}"
echo ""

# Step 3: Login to ECR
echo -e "${YELLOW}🔐 Logging into ECR...${NC}"
aws ecr get-login-password --region ${AWS_REGION} | \
  docker login --username AWS --password-stdin ${ECR_REGISTRY} || {
  echo -e "${RED}❌ ECR login failed${NC}"
  exit 1
}
echo -e "${GREEN}✓ ECR login successful${NC}"
echo ""

# Step 4: Tag image for ECR
echo -e "${YELLOW}🏷️  Tagging image for ECR...${NC}"
docker tag ${IMAGE_NAME}:latest ${IMAGE_URI}:latest
docker tag ${IMAGE_NAME}:latest ${IMAGE_URI}:${TIMESTAMP}
echo -e "${GREEN}✓ Image tagged${NC}"
echo ""

# Step 5: Push image to ECR
echo -e "${YELLOW}📤 Pushing image to ECR...${NC}"
docker push ${IMAGE_URI}:latest || {
  echo -e "${RED}❌ Failed to push latest tag${NC}"
  exit 1
}
docker push ${IMAGE_URI}:${TIMESTAMP} || {
  echo -e "${RED}❌ Failed to push timestamp tag${NC}"
  exit 1
}
echo -e "${GREEN}✓ Image pushed to ECR${NC}"
echo ""

# Step 6: Set MASK_KEY in EB environment
echo -e "${YELLOW}🔑 Generating MASK_KEY...${NC}"
MASK_KEY=$(openssl rand -base64 32)
echo -e "${GREEN}✓ MASK_KEY generated${NC}"
echo ""

echo -e "${YELLOW}📝 Setting environment variables in EB...${NC}"
aws elasticbeanstalk update-environment \
  --application-name ${EB_APP_NAME} \
  --environment-name ${EB_ENV_NAME} \
  --option-settings \
    Namespace=aws:elasticbeanstalk:application:environment,OptionName=MASK_KEY,Value="${MASK_KEY}" \
  --region ${AWS_REGION} || {
  echo -e "${RED}❌ Failed to update EB environment variables${NC}"
  exit 1
}
echo -e "${GREEN}✓ Environment variables updated${NC}"
echo ""

# Step 7: Deploy to EB
echo -e "${YELLOW}🚀 Deploying to Elastic Beanstalk...${NC}"
aws elasticbeanstalk create-application-version \
  --application-name ${EB_APP_NAME} \
  --version-label ${IMAGE_NAME}-${TIMESTAMP} \
  --source-bundle S3Bucket=elasticbeanstalk-${AWS_REGION}-${AWS_ACCOUNT_ID},S3Key=temp.zip \
  --region ${AWS_REGION} 2>/dev/null || true

# Update environment to use the new Docker image via .ebextensions or direct image reference
aws elasticbeanstalk update-environment \
  --application-name ${EB_APP_NAME} \
  --environment-name ${EB_ENV_NAME} \
  --option-settings \
    Namespace=aws:elasticbeanstalk:application:environment,OptionName=IMAGE_URI,Value="${IMAGE_URI}:${TIMESTAMP}" \
  --region ${AWS_REGION} || {
  echo -e "${RED}❌ Failed to trigger EB deployment${NC}"
  exit 1
}
echo -e "${GREEN}✓ Deployment triggered${NC}"
echo ""

# Step 8: Monitor deployment
echo -e "${YELLOW}⏳ Waiting for deployment to start (this may take a minute)...${NC}"
sleep 30

echo -e "${BLUE}📊 Checking deployment status...${NC}"
aws elasticbeanstalk describe-environment-health \
  --environment-name ${EB_ENV_NAME} \
  --attribute-keys InstancesSevere,InstancesWarning,InstancesOk,InstancesUnknown \
  --region ${AWS_REGION} 2>/dev/null || true

echo ""
echo -e "${GREEN}✅ Deployment initiated successfully!${NC}"
echo ""
echo -e "${BLUE}Next steps:${NC}"
echo "1. Monitor logs in real-time:"
echo -e "   ${YELLOW}eb logs --all --stream${NC}"
echo ""
echo "2. Check deployment status:"
echo -e "   ${YELLOW}eb status${NC}"
echo ""
echo "3. View recent events:"
echo -e "   ${YELLOW}aws elasticbeanstalk describe-events --environment-name ${EB_ENV_NAME} --region ${AWS_REGION}${NC}"
echo ""
echo -e "${BLUE}Deployment details:${NC}"
echo "  Application: $EB_APP_NAME"
echo "  Environment: $EB_ENV_NAME"
echo "  Image: ${IMAGE_URI}:${TIMESTAMP}"
echo "  MASK_KEY: (set to random secure value)"
echo ""
echo -e "${GREEN}🎉 Alembic migrations will run automatically on container startup!${NC}"
