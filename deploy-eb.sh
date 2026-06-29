#!/bin/bash

set -e

# Configuration
EB_APP_NAME="${EB_APP_NAME:-paybot}"
EB_ENV_NAME="${EB_ENV_NAME:-paybot-production}"
AWS_REGION="${AWS_REGION:-ap-southeast-1}"
AWS_ACCOUNT_ID="${AWS_ACCOUNT_ID}"
ECR_REGISTRY="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
IMAGE_NAME="paybot"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 Deploying xend to AWS Elastic Beanstalk...${NC}"

# Validate inputs
if [ -z "$AWS_ACCOUNT_ID" ]; then
  echo -e "${RED}❌ Error: AWS_ACCOUNT_ID not set${NC}"
  exit 1
fi

# 1. Build the Docker image
echo -e "${YELLOW}📦 Building Docker image...${NC}"
docker build \
  -t ${IMAGE_NAME}:latest \
  --build-arg VITE_TURNSTILE_SITE_KEY="${VITE_TURNSTILE_SITE_KEY}" \
  --build-arg VITE_TELEGRAM_BOT_USERNAME="${VITE_TELEGRAM_BOT_USERNAME}" \
  -f Dockerfile . || {
  echo -e "${RED}❌ Docker build failed${NC}"
  exit 1
}

TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# 2. Tag for ECR
echo -e "${YELLOW}🏷️  Tagging for ECR...${NC}"
docker tag ${IMAGE_NAME}:latest ${ECR_REGISTRY}/${IMAGE_NAME}:latest
docker tag ${IMAGE_NAME}:latest ${ECR_REGISTRY}/${IMAGE_NAME}:${TIMESTAMP}

# 3. Login to ECR
echo -e "${YELLOW}���� Logging into ECR...${NC}"
aws ecr get-login-password --region ${AWS_REGION} | \
  docker login --username AWS --password-stdin ${ECR_REGISTRY} || {
  echo -e "${RED}❌ ECR login failed${NC}"
  exit 1
}

# 4. Push to ECR
echo -e "${YELLOW}⬆️  Pushing to ECR...${NC}"
docker push ${ECR_REGISTRY}/${IMAGE_NAME}:latest || {
  echo -e "${RED}❌ Failed to push latest tag${NC}"
  exit 1
}
docker push ${ECR_REGISTRY}/${IMAGE_NAME}:${TIMESTAMP} || {
  echo -e "${RED}❌ Failed to push timestamp tag${NC}"
  exit 1
}

# 5. Create Dockerrun.aws.json for Elastic Beanstalk
echo -e "${YELLOW}📝 Creating Dockerrun.aws.json...${NC}"
cat > Dockerrun.aws.json << EOF
{
  "AWSEBDockerrunVersion": "1",
  "Image": {
    "Name": "${ECR_REGISTRY}/${IMAGE_NAME}:latest",
    "Update": true
  },
  "Ports": [
    {
      "ContainerPort": 8000,
      "HostPort": 80
    }
  ],
  "Logging": "/var/log/paybot",
  "Memory": 512,
  "Essential": true
}
EOF

# 6. Create EB archive
echo -e "${YELLOW}📦 Creating Elastic Beanstalk deployment package...${NC}"
zip -r paybot-deployment-${TIMESTAMP}.zip \
  Dockerrun.aws.json \
  .ebextensions/ \
  -x ".git/*" "node_modules/*" ".env*" "*.log" > /dev/null 2>&1 || {
  echo -e "${RED}❌ Failed to create deployment package${NC}"
  exit 1
}

# 7. Deploy with EB CLI
echo -e "${YELLOW}🚀 Deploying to Elastic Beanstalk (${EB_ENV_NAME})...${NC}"

if ! command -v eb &> /dev/null; then
  echo -e "${RED}❌ Error: EB CLI not installed. Install with: pip install awsebcli${NC}"
  exit 1
fi

eb deploy ${EB_ENV_NAME} || {
  echo -e "${RED}❌ EB deployment failed${NC}"
  exit 1
}

echo -e "${GREEN}✅ Deployment complete!${NC}"
echo -e "${GREEN}📊 Application: ${EB_APP_NAME}${NC}"
echo -e "${GREEN}📊 Environment: ${EB_ENV_NAME}${NC}"
echo -e "${GREEN}🌍 Region: ${AWS_REGION}${NC}"
echo -e "${GREEN}🐳 Image: ${ECR_REGISTRY}/${IMAGE_NAME}:${TIMESTAMP}${NC}"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "  1. Verify deployment: eb status"
echo "  2. View logs: eb logs --all"
echo "  3. SSH into instance: eb ssh"