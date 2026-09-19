# AWS nine-day deployment

This stack deploys the private repository without SSH or long-lived AWS keys.

## Architecture

- Terraform-managed VPC, public subnet, security group, Elastic IP, EC2 and encrypted gp3 root disk.
- GitHub Actions OIDC assumes a branch-restricted AWS role.
- GitHub Actions builds frontend/backend images and pushes them to ECR.
- AWS Systems Manager runs the idempotent deployment command on EC2.
- Caddy terminates HTTPS at the temporary `<elastic-ip>.sslip.io` hostname.
- PostgreSQL requires TLS with a private, deployment-local CA.
- Daily PostgreSQL and upload backups are encrypted in S3.
- Budget emails trigger at USD 40, 70 and 90 against a USD 112 monthly cap.

There is deliberately no SSH, NAT Gateway, load balancer, RDS, or instance snapshot.

## Prerequisites

- Terraform >= 1.7
- AWS CLI authenticated to the target account
- Docker for local container verification
- Permission to create IAM, EC2, ECR, S3, SSM, SNS, CloudWatch and AWS Budgets resources

## 1. Validate application and containers

From the repository root:

```powershell
cd frontend
npm ci
npm run audit:security
npm run lint
npm run build
npm test -- --runInBand

cd ../backend
npm ci
npm run audit:security
npm run lint
npm run build
npm test -- --runInBand

cd ..
docker build -t mdp-frontend-test --build-arg NEXT_PUBLIC_API_URL=/api/v1 ./frontend
docker build -t mdp-backend-test ./backend
```

## 2. Plan and provision AWS

```powershell
Copy-Item infra/terraform.tfvars.example infra/terraform.tfvars
terraform -chdir=infra fmt -check
terraform -chdir=infra init
terraform -chdir=infra validate
terraform -chdir=infra plan -out=demo.tfplan
```

Review the plan. It should contain one EC2 instance and no NAT Gateway, ALB, RDS, or SSH rule.

```powershell
terraform -chdir=infra apply demo.tfplan
terraform -chdir=infra output
```

Confirm the SNS subscription email sent to `eyadelmaleh07@gmail.com`.

If the AWS account already has the GitHub Actions OIDC provider, import it before applying:

```powershell
terraform -chdir=infra import aws_iam_openid_connect_provider.github arn:aws:iam::<ACCOUNT_ID>:oidc-provider/token.actions.githubusercontent.com
```

## 3. Configure the private repository

Copy the Terraform output `github_actions_role_arn` into this repository variable:

- `AWS_DEPLOY_ROLE_ARN`

Optionally add the Google Web client ID as:

- `NEXT_PUBLIC_GOOGLE_CLIENT_ID`

Copy `deploy/app.env.production.example` outside the repository, replace every placeholder, and use the Terraform `application_url` for `FRONTEND_URL`. Store the entire file as the repository secret:

- `PRODUCTION_ENV_FILE`

The database password, JWT secrets and email outbox key must all be different random values. Do not put AWS keys, Terraform state, or secrets in Git.

## 4. Google authentication limitation

The temporary sslip.io hostname provides HTTPS, but Google sign-in only works after that exact Terraform `application_url` is added as an Authorized JavaScript Origin in Google Cloud. The frontend and backend must use the same Web client ID.

## 5. Deploy

Open GitHub Actions, select **Deploy AWS demo**, choose **Run workflow**, and type `DEPLOY`.

The workflow:

1. Assumes AWS access through OIDC.
2. Builds and scans ECR images.
3. stores the runtime environment as SSM SecureString.
4. finds the Terraform-managed EC2 instance.
5. deploys through SSM.
6. runs TypeORM migrations.
7. waits for the public health endpoint.

No GitHub token is stored on EC2.

## 6. Verify

```powershell
$AppUrl = terraform -chdir=infra output -raw application_url
curl.exe -i "$AppUrl/api/v1/health/live"
curl.exe -i "$AppUrl/api/v1/health/ready"
```

Then test login, Google login, uploads, bundles, 40/200 MCQ sessions, essays, notification delivery and refresh-token continuity.

## 7. Nine-day teardown

Create one final backup before teardown by using SSM Run Command with:

```bash
sudo /usr/local/bin/mdp-backup
```

When `retain_backups=false` (the default), teardown also deletes the backup bucket to stop all ongoing charges:

```powershell
terraform -chdir=infra plan -destroy -out=destroy.tfplan
terraform -chdir=infra apply destroy.tfplan
```

Verify that EC2, EIP, EBS, ECR, S3, SNS and CloudWatch resources are gone. AWS Budgets can take time to reflect final usage.
