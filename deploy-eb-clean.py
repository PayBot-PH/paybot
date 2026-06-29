#!/usr/bin/env python3
"""
AWS EB Deployment Script - Direct API Approach
"""

import os
import sys
import subprocess
import json
from datetime import datetime
import base64

def run_cmd(cmd):
    """Run shell command."""
    try:
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=60)
        return result.returncode == 0, result.stdout.strip(), result.stderr.strip()
    except Exception as e:
        return False, "", str(e)

def main():
    print("\n" + "=" * 60)
    print("  xend AWS EB Deployment - Auto Discovery")
    print("=" * 60)

    # Environment setup
    access_key = os.getenv("AWS_ACCESS_KEY_ID")
    secret_key = os.getenv("AWS_SECRET_ACCESS_KEY")
    account_id = os.getenv("AWS_ACCOUNT_ID", "069857851322")
    region = os.getenv("AWS_REGION", "ap-southeast-1")
    
    if not access_key or not secret_key:
        print("❌ AWS credentials missing")
        sys.exit(1)

    print(f"\n✓ AWS Setup:")
    print(f"  Region: {region}")
    print(f"  Account: {account_id}")

    # Install boto3
    print(f"\n🔧 Installing boto3...")
    success, out, err = run_cmd("pip install -q boto3 2>&1 | tail -1")

    # Python code for discovering and deploying
    python_script = f"""
import boto3
import json
from datetime import datetime

# Initialize clients
eb = boto3.client('elasticbeanstalk', 
    region_name='{region}',
    aws_access_key_id='{access_key}',
    aws_secret_access_key='{secret_key}')

s3 = boto3.client('s3',
    region_name='{region}',
    aws_access_key_id='{access_key}',
    aws_secret_access_key='{secret_key}')

# Find EB environment
print("\\n🔍 Discovering environments...")
response = eb.describe_environments()
envs = response.get('Environments', [])

if not envs:
    print("❌ No EB environments found")
    exit(1)

env_name = None
for e in envs:
    e_name = e.get('EnvironmentName', '')
    app = e.get('ApplicationName', '')
    status = e.get('Status', '')
    print(f"  Found: {{e_name}} ({{app}}) - {{status}}")
    if env_name is None:
        env_name = e_name

if not env_name:
    print("❌ Could not select environment")
    exit(1)

print(f"\\n✓ Selected environment: {env_name}")

# Use latest image from ECR
timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
docker_image = "{account_id}.dkr.ecr.{region}.amazonaws.com/paybot:latest"

print(f"\\n📝 Creating Dockerrun.aws.json...")
dockerrun = {{
    "AWSEBDockerrunVersion": "1",
    "Image": {{
        "Name": docker_image,
        "Update": "true"
    }},
    "Ports": [
        {{
            "ContainerPort": "8000",
            "HostPort": "80"
        }}
    ]
}}

# Create version label
version_label = f"paybot-{{timestamp}}"

# Save Dockerrun locally and create ZIP
import zipfile
import os

# Create Dockerrun.aws.json
with open('/workspaces/paybot/Dockerrun.aws.json', 'w') as f:
    json.dump(dockerrun, f, indent=2)

# Create deployment ZIP
zip_path = f'/tmp/{{version_label}}.zip'
with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zf:
    zf.write('/workspaces/paybot/Dockerrun.aws.json', arcname='Dockerrun.aws.json')
    
    # Add .ebextensions
    for root, dirs, files in os.walk('/workspaces/paybot/.ebextensions'):
        for fname in files:
            full_path = os.path.join(root, fname)
            arcname = full_path.replace('/workspaces/paybot/', '')
            zf.write(full_path, arcname=arcname)

print(f"  ✓ Dockerrun.aws.json created")
print(f"  ✓ ZIP package: {{version_label}}.zip")

# Upload to S3
bucket_name = f"{{account_id}}-paybot-deploy"
s3_key = f"{{version_label}}.zip"

try:
    print(f"\\n📤 Uploading to S3...")
    with open(zip_path, 'rb') as f:
        s3.put_object(Bucket=bucket_name, Key=s3_key, Body=f.read())
    print(f"  ✓ Uploaded: s3://{{bucket_name}}/{{s3_key}}")
except Exception as e:
    if 'NoSuchBucket' in str(e):
        print(f"  ⚠️  Bucket not found: {{bucket_name}}")
        print(f"     Creating S3 bucket...")
        try:
            s3.create_bucket(
                Bucket=bucket_name,
                CreateBucketConfiguration={{'LocationConstraint': '{region}'}}
            )
            with open(zip_path, 'rb') as f:
                s3.put_object(Bucket=bucket_name, Key=s3_key, Body=f.read())
            print(f"  ✓ Bucket created and ZIP uploaded")
        except Exception as e2:
            print(f"  ❌ Could not create bucket: {{e2}}")
            exit(1)
    else:
        print(f"  ❌ S3 upload failed: {{e}}")
        exit(1)

# Create application version
print(f"\\n📋 Creating application version...")
app_name = None
for e in envs:
    if e.get('EnvironmentName') == env_name:
        app_name = e.get('ApplicationName')
        break

if not app_name:
    print("❌ Could not find application name")
    exit(1)

try:
    eb.create_app_version(
        ApplicationName=app_name,
        VersionLabel=version_label,
        SourceBundle={{'S3Bucket': bucket_name, 'S3Key': s3_key}},
        AutoCreateApplicationVersion=False
    )
    print(f"  ✓ Created version: {{version_label}}")
except Exception as e:
    if 'already exists' in str(e):
        print(f"  ✓ Version already exists: {{version_label}}")
    else:
        print(f"  ❌ Failed to create version: {{e}}")
        # Continue anyway

# Deploy to environment
print(f"\\n🚀 Deploying to {env_name}...")
try:
    eb.update_environment(
        ApplicationName=app_name,
        EnvironmentName=env_name,
        VersionLabel=version_label
    )
    print(f"  ✓ Deployment initiated!")
except Exception as e:
    print(f"  ❌ Deployment failed: {{e}}")
    exit(1)

# Check status
print(f"\\n📊 Environment Status:")
response = eb.describe_environments(EnvironmentNames=[env_name])
if response.get('Environments'):
    env = response['Environments'][0]
    print(f"  Environment: {{env.get('EnvironmentName')}}")
    print(f"  Status: {{env.get('Status')}}")
    print(f"  Health: {{env.get('HealthStatus')}}")
    print(f"  URL: {{env.get('CNAME', 'pending')}}")
    print(f"  Version: {{env.get('VersionLabel', version_label)}}")

print(f"\\n✅ Deployment started!")
print(f"\\n📌 Monitor in AWS Console:")
print(f"   https://console.aws.amazon.com/elasticbeanstalk/home?region={region}")
print(f"\\n   Environment: {env_name}")
"""

    # Run the Python deployment
    success, out, err = run_cmd(f'python3 << "EOF"\n{python_script}\nEOF')
    
    if out:
        print(out)
    if err and not success:
        print(f"❌ Error: {err}")
        sys.exit(1)

if __name__ == "__main__":
    main()
