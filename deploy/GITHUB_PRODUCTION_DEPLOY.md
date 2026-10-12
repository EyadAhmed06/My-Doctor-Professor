# GitHub Production Deployment

Workflow: https://github.com/EyadAhmed06/My-Doctor-Professor/actions/workflows/deploy-production.yml

## One-time setup

1. Create AWS IAM GitHub OIDC role limited to this repository and the production GitHub environment. Trust token.actions.githubusercontent.com with audience sts.amazonaws.com and subject repo:EyadAhmed06/My-Doctor-Professor:environment:production. Protect the GitHub production environment with branch restrictions and reviewers.
2. Set repository variable AWS_PRODUCTION_DEPLOY_ROLE_ARN (the dedicated production role ARN).
3. Set repository variable AWS_PRODUCTION_INSTANCE_ID (the exact existing production EC2 instance ID).
4. Optionally set AWS_PRODUCTION_DEPLOY_LOG_GROUP and provide the matching CloudWatch log permissions.
5. Give the OIDC role EC2 DescribeInstances, SSM DescribeInstanceInformation, SSM SendCommand for the production instance and AWS-RunShellScript document, and SSM GetCommandInvocation. Scope permissions to the specific instance/document as applicable. The EC2 instance must be SSM Online with its existing SSM instance profile.
6. Keep /opt/mdp/update-ec2.sh installed on EC2, plus the existing /opt/mdp-source checkout and production env files. SSM agent must have sudo authority to execute the guarded deploy script. No DB secrets are transferred via GitHub.

Example trust condition:
- token.actions.githubusercontent.com:aud = sts.amazonaws.com
- token.actions.githubusercontent.com:sub = repo:EyadAhmed06/My-Doctor-Professor:environment:production

IMPORTANT: GitHub environment protection is essential: environment-based OIDC trust by itself does not restrict which branch may run the job.

## Deploy

1. Wait for Security and Browser Regression push runs to pass for the current agent/phase1-interactions HEAD.
2. GitHub Actions > Production Deployment > Run workflow.
3. Select agent/phase1-interactions, type DEPLOY, and optionally paste the full 40-character latest SHA.
4. GitHub validates CI, assumes AWS OIDC role, confirms EC2/SSM are online, and executes the existing guarded script through noninteractive SSM Run Command. It polls status and prints the SSM command ID plus final output.

Manual trigger only until a real production deployment and rollback drill are verified. Never enable automatic deploys before that.

## Boundaries

- Releasing stale commits, failed checks or non-HEAD commits is blocked.
- GitHub deployment concurrency and EC2 flock protect against simultaneous deployments.
- Existing script handles backup, isolated migration rehearsal, application health, and rollback attempt.
- Database migrations are not automatically reversed on rollback; evaluate schema compatibility.
- Optional CloudWatch Logs retains extended output; ordinary SSM invocation output may be truncated.
- GitHub job runs for up to 90 minutes. EC2 resource failures still need diagnostics, though no browser/SSM session babysitting is required.
