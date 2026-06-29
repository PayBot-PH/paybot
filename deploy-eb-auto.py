#!/usr/bin/env python3
"""
Automatic AWS EB Deployment with Auto-Discovery
Deploys xend to AWS Elastic Beanstalk using boto3 (no AWS CLI needed)
"""

import os
import sys
import subprocess
import json
from datetime import datetime

def run_cmd(cmd, description=""):
    """Run shell command and return output."""
    try:
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=300)
        if result.returncode != 0:
            print(f"❌ {description}: {result.stderr}")
            return None
        return result.stdout.strip()
    except Exception as e:
        print(f"❌ Error running command: {e}")
        return None

def main():
    print("\n" + "=" * 55)
    print("  xend AWS Elastic Beanstalk Auto-Deploy")
    print("=" * 55)

    # Get AWS credentials from environment
    access_key = os.getenv("AWS_ACCESS_KEY_ID")
    secret_key = os.getenv("AWS_SECRET_ACCESS_KEY")
    account_id = os.getenv("AWS_ACCOUNT_ID", "069857851322")
    region = os.getenv("AWS_REGION", "ap-southeast-1")
    
    if not access_key or not secret_key:
        print("❌ AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY required")
        sys.exit(1)

    print(f"\n✓ Configuration:")
    print(f"  Account ID: {account_id}")
    print(f"  Region: {region}")
    print(f"  ECR Registry: {account_id}.dkr.ecr.{region}.amazonaws.com")

    # Install boto3 silently
    print(f"\n🔧 Installing boto3...")
    run_cmd("pip install -q boto3", "Boto3 installation")

    # Discover EB environments
    print(f"\n🔍 Discovering EB environments...")
    
    python_code = f"""
import boto3
import json

eb = boto3.client('elasticbeanstalk', region_name='{region}', 
    aws_access_key_id='{access_key}',
    aws_secret_access_key='{secret_key}')

try:
    response = eb.describe_environments()
    envs = response.get('Environments', [])
    
    if not envs:
        print('No environments found')
        exit(1)
    
    # Print environments as JSON
    for env in envs:
        print(json.dumps({{
            'name': env.get('EnvironmentName'),
            'app': env.get('ApplicationName'),
            'status': env.get('Status'),
            'health': env.get('HealthStatus')
        }}))
except Exception as e:
    print(f'Error: {{e}}')
    exit(1)
"""
    
    env_output = run_cmd(f"python3 -c \"{python_code}\"", "Fetching EB environments")
    
    if not env_output:
        print("❌ Could not fetch EB environments. Check credentials.")
        sys.exit(1)

    environments = []
    for line in env_output.split('\n'):
        if line.strip():
            try:
                env = json.loads(line)
                environments.append(env)
                print(f"  • {env['name']} ({env['app']}) - {env['status']}")
            except:
                pass

    if not environments:
        print("❌ No EB environments found")
        sys.exit(1)

    # Auto-select environment (prefer production)
    target_env = None
    for env in environments:
        if 'production' in env['name'].lower() or 'prod' in env['name'].lower():
            target_env = env['name']
            break
    
    if not target_env:
        target_env = environments[0]['name']

    print(f"\n✓ Target environment: {target_env}")

    # Check Docker image
    print(f"\n📋 Docker image status...")
    docker_img = f"{account_id}.dkr.ecr.{region}.amazonaws.com/paybot"
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    image_tag = f"{docker_img}:{timestamp}"
    
    print(f"  Image: {image_tag}")

    # Get current image tags
    list_images = f"""
import boto3
ecr = boto3.client('ecr', region_name='{region}',
    aws_access_key_id='{access_key}',
    aws_secret_access_key='{secret_key}')

try:
    response = ecr.describe_images(repositoryName='paybot', maxResults=10)
    images = response.get('imageDetails', [])
    for img in images:
        tags = img.get('imageTags', [])
        if tags:
            print(f"  Tag: {{tags[0]}}")
except Exception as e:
    print(f'  (Could not list: {{e}})')
"""
    
    run_cmd(f"python3 -c \"{list_images}\"", "Listing ECR images")

    # Create Dockerrun.aws.json
    print(f"\n📝 Creating Dockerrun.aws.json...")
    
    dockerrun = {
        "AWSEBDockerrunVersion": "1",
        "Image": {
            "Name": f"{docker_img}:latest",
            "Update": "true"
        },
        "Ports": [
            {
                "ContainerPort": "8000",
                "HostPort": "80"
            }
        ],
        "Logging": "/var/log/paybot"
    }
    
    with open("/workspaces/paybot/Dockerrun.aws.json", "w") as f:
        json.dump(dockerrun, f, indent=2)
    
    print(f"  ✓ Created Dockerrun.aws.json")

    # Deploy via ZIP
    print(f"\n📦 Creating deployment package...")
    
    pkg_name = f"paybot-{timestamp}.zip"
    
    # Create .zip with required files
    create_zip = f"""
import os
import zipfile

with zipfile.ZipFile('/tmp/{pkg_name}', 'w', zipfile.ZIP_DEFLATED) as zf:
    # Add Dockerrun.aws.json
    zf.write('/workspaces/paybot/Dockerrun.aws.json', arcname='Dockerrun.aws.json')
    
    # Add .ebextensions
    for root, dirs, files in os.walk('/workspaces/paybot/.ebextensions'):
        for f in files:
            full_path = os.path.join(root, f)
            arcname = full_path.replace('/workspaces/paybot/', '')
            zf.write(full_path, arcname=arcname)

print('Created /tmp/{pkg_name}')
"""
    
    run_cmd(f"python3 -c \"{create_zip}\"", "Creating deployment ZIP")

    # Upload to S3 and create app version
    print(f"\n🚀 Creating application version and deploying...")
    
    deploy_code = f"""
import boto3
import os

s3 = boto3.client('s3', region_name='{region}',
    aws_access_key_id='{access_key}',
    aws_secret_access_key='{secret_key}')

eb = boto3.client('elasticbeanstalk', region_name='{region}',
    aws_access_key_id='{access_key}',
    aws_secret_access_key='{secret_key}')

app_name = 'paybot'
env_name = '{target_env}'
version_label = 'paybot-{timestamp}'
bucket = f'{account_id}-paybot-deploy'
key = f'{{version_label}}.zip'

# Upload to S3
try:
    with open('/tmp/{pkg_name}', 'rb') as f:
        s3.put_object(Bucket=bucket, Key=key, Body=f.read())
    print(f'  ✓ Uploaded to S3: s3://{{bucket}}/{{key}}')
except Exception as e:
    print(f'  ⚠️  S3 upload: {{e}} (may already exist)')

# Create application version
try:
    eb.create_app_version(
        ApplicationName=app_name,
        VersionLabel=version_label,
        SourceBundle={{'S3Bucket': bucket, 'S3Key': key}},
        AutoCreateApplicationVersion=False
    )
    print(f'  ✓ Created application version: {{version_label}}')
except Exception as e:
    if 'already exists' in str(e):
        print(f'  ✓ Version exists: {{version_label}}')
    else:
        print(f'  ⚠️  {{e}}')

# Update environment
try:
    eb.update_environment(
        ApplicationName=app_name,
        EnvironmentName=env_name,
        VersionLabel=version_label
    )
    print(f'  ✓ Deployment initiated to {{env_name}}')
except Exception as e:
    print(f'  ❌ Deployment failed: {{e}}')
    exit(1)
"""
    
    run_cmd(f"python3 -c \"{deploy_code}\"", "Deploying to EB")

    # Check deployment status
    print(f"\n📊 Deployment Status:")
    
    status_code = f"""
import boto3
import time

eb = boto3.client('elasticbeanstalk', region_name='{region}',
    aws_access_key_id='{access_key}',
    aws_secret_access_key='{secret_key}')

try:
    response = eb.describe_environments(EnvironmentNames=['{target_env}'])
    env = response['Environments'][0]
    
    print(f"  Environment: {{env.get('EnvironmentName')}}")
    print(f"  Status: {{env.get('Status')}}")
    print(f"  Health: {{env.get('HealthStatus')}}")
    print(f"  Version: {{env.get('VersionLabel')}}")
    print(f"  URL: {{env.get('CNAME')}}")
    
except Exception as e:
    print(f'  Error: {{e}}')
"""
    
    run_cmd(f"python3 -c \"{status_code}\"", "Checking status")

    print(f"\n✅ Deployment triggered!")
    print(f"\n📋 Monitor deployment:")
    print(f"  AWS Console: https://console.aws.amazon.com/elasticbeanstalk")
    print(f"  Environment: {target_env}")
    print(f"  Check logs: aws elasticbeanstalk describe-events --environment-name {target_env} --region {region}")

if __name__ == "__main__":
    main()
