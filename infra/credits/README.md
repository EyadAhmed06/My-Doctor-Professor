# AWS Free Tier credit activity stack

This stack automates the AWS resources/actions that map to the five additional-credit activities for new AWS customers:

- AWS Budgets: creates a monthly cost budget.
- EC2: launches a small, network-isolated instance.
- RDS: creates a small private PostgreSQL instance.
- Lambda: creates a Lambda function and public Function URL, then invokes it once.
- Bedrock: invokes Amazon Nova Micro through the Bedrock Runtime API, then queries the AWS Free Tier API for the authoritative activity status.

The credit resources are deliberately separate from `../` (the existing application deployment Terraform). They should not be destroyed until AWS reports the relevant account activities as `COMPLETED`.

## First run from Windows PowerShell

A brand-new AWS account has a bootstrap problem: GitHub Actions cannot assume an AWS role until that account already contains the GitHub OIDC provider and IAM role. The repository therefore includes a one-command authenticated runner that performs the bootstrap and the earning activities without manually creating the five services in the console.

Prerequisites:

- AWS CLI authenticated to the new account.
- Terraform 1.16.x in `PATH`.
- Optional: authenticated GitHub CLI (`gh`) if you also want the runner to populate the non-secret repository variables automatically.

From the repository root:

```powershell
.\scripts\aws\free-tier-credits.ps1 -Action Apply -BudgetEmail "you@example.com" -ConfigureGitHubVariables
```

Without GitHub CLI, omit `-ConfigureGitHubVariables`; the script prints the two values that GitHub Actions needs:

- `AWS_CREDITS_ROLE_ARN`
- `AWS_TERRAFORM_STATE_BUCKET`

Optional repository variable:

- `AWS_BUDGET_EMAIL`

Check AWS's authoritative activity state later without touching resources:

```powershell
.\scripts\aws\free-tier-credits.ps1 -Action Status
```

Only after AWS reports every intended earning activity as `COMPLETED`:

```powershell
.\scripts\aws\free-tier-credits.ps1 -Action Destroy -ConfirmDestroy
```

The destroy path intentionally refuses to proceed while AWS reports incomplete activities.

## GitHub Actions after bootstrap

Once the OIDC role and remote state exist, `.github/workflows/aws-credit-activities.yml` can perform `apply`, `status`, or guarded `destroy` without long-lived AWS access keys.

## Bedrock caveat

AWS's earning-activity documentation describes the Bedrock task using the console Playground. This automation performs an equivalent model inference through the Bedrock Runtime API, but it does not assume that AWS will count the API call. The script/workflow checks the Free Tier API after the invocation. If AWS still reports only the Bedrock activity as incomplete, that one Playground interaction may be unavoidable; the other activities remain automated.
