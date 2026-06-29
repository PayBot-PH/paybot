#!/usr/bin/env python3
"""AWS EB Deployment - Simplified"""

import os
import sys
import subprocess
import json
import zipfile
from datetime import datetime

def run_cmd(cmd):
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=60)
    return result.returncode == 0, result.stdout.strip(), result.stderr.strip()

access_key = os.getenv("AWS_ACCESS_KEY_ID")
secret_key = os.getenv("AWS_SECRET_ACCESS_KEY")
account_id = os.getenv("AWS_ACCOUNT_ID", "069857851322")
region = os.getenv("AWS_REGION", "ap-southeast-1")

if not access_key or not secret_key:
    print("❌ AWS credentials missing")
    sys.exit(1)

print("\n" + "="*60)
print("  xend AWS EB Deployment")
print("="*60)

print(f"\n✓ Setup:")
print(f"  Region: {region}")
print(f"  Account: {account_id}")

# Install boto3
print(f"\n🔧 Installing boto3...")
run_cmd("pip install -q boto3")

# Import after install
import boto3

# Clients
eb = boto3.client('elasticbeanstalk', region_name=region,
    aws_access_key_id=access_key,
    aws_secret_access_key=secret_key)

s3 = boto3.client('s3', region_name=region,
    aws_access_key_id=access_key,
    aws_secret_access_key=secret_key)

# Find environment
print(f"\n🔍 Discovering EB environment...")
response = eb.describe_environments()
envs = response.get('Environments', [])

if not envs:
    print("❌ No environments found")
    sys.exit(1)

for e in envs:
    print(f"  Found: {e.get('EnvironmentName')} ({e.get('ApplicationName')}) - {e.get('Status')}")

# Use first environment
env_name = envs[0]['EnvironmentName']
app_name = envs[0]['ApplicationName']

print(f"\n✓ Target environment: {env_name}")

# Create deployment package
print(f"\n📝 Creating deployment package...")

timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
version_label = f"paybot-{timestamp}"

# Dockerrun.aws.json
dockerrun = {
    "AWSEBDockerrunVersion": "1",
    "Image": {
        "Name": f"{account_id}.dkr.ecr.{region}.amazonaws.com/paybot:latest",
        "Update": "true"
    },
    "Ports": [
        {
            "ContainerPort": "8000",
            "HostPort": "80"
        }
    ]
}

# Write Dockerrun
with open('/workspaces/paybot/Dockerrun.aws.json', 'w') as f:
    json.dump(dockerrun, f, indent=2)

# Create ZIP
zip_path = f'/tmp/{version_label}.zip'
with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zf:
    zf.write('/workspaces/paybot/Dockerrun.aws.json', arcname='Dockerrun.aws.json')
    
    # Add .ebextensions
    import os as os2
    for root, dirs, files in os2.walk('/workspaces/paybot/.ebextensions'):
        for fname in files:
            full_path = os2.path.join(root, fname)
            arcname = full_path.replace('/workspaces/paybot/', '')
            zf.write(full_path, arcname=arcname)

print(f"  ✓ Created {version_label}.zip")

# Upload to S3
print(f"\n📤 Uploading to S3...")
bucket = f"{account_id}-paybot-deploy"
key = f"{version_label}.zip"

try:
    with open(zip_path, 'rb') as f:
        s3.put_object(Bucket=bucket, Key=key, Body=f.read())
    print(f"  ✓ Uploaded to s3://{bucket}/{key}")
except Exception as e:
    if 'NoSuchBucket' in str(e):
        print(f"  Creating bucket...")
        try:
            s3.create_bucket(
                Bucket=bucket,
                CreateBucketConfiguration={'LocationConstraint': region}
            )
            with open(zip_path, 'rb') as f:
                s3.put_object(Bucket=bucket, Key=key, Body=f.read())
            print(f"  ✓ Bucket created and ZIP uploaded")
        except Exception as e2:
            print(f"  ❌ Failed: {e2}")
            sys.exit(1)
    else:
        print(f"  ❌ Upload failed: {e}")
        sys.exit(1)

# Create app version
print(f"\n📋 Creating app version...")
try:
    eb.create_application_version(
        ApplicationName=app_name,
        VersionLabel=version_label,
        SourceBundle={'S3Bucket': bucket, 'S3Key': key}
    )
    print(f"  ✓ Created version: {version_label}")
except Exception as e:
    if 'already exists' in str(e):
        print(f"  ✓ Version exists")
    else:
        print(f"  ⚠️  {e}")

# Deploy
print(f"\n🚀 Deploying to {env_name}...")
try:
    eb.update_environment(
        ApplicationName=app_name,
        EnvironmentName=env_name,
        VersionLabel=version_label
    )
    print(f"  ✓ Deployment initiated!")
except Exception as e:
    print(f"  ❌ Failed: {e}")
    sys.exit(1)

# Status
print(f"\n📊 Status:")
response = eb.describe_environments(EnvironmentNames=[env_name])
if response.get('Environments'):
    env = response['Environments'][0]
    print(f"  Environment: {env.get('EnvironmentName')}")
    print(f"  Status: {env.get('Status')}")
    print(f"  Health: {env.get('HealthStatus')}")
    print(f"  URL: {env.get('CNAME', 'pending')}")

print(f"\n✅ Deployment successfully triggered!")
print(f"\n📌 Monitor:")
print(f"   https://console.aws.amazon.com/elasticbeanstalk/home?region={region}")
