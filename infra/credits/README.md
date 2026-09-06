# AWS Free Tier credit activity stack

This stack automates the AWS resources/actions that map to the five additional-credit activities for new AWS customers:

- AWS Budgets: creates a monthly cost budget.
- EC2: launches a small, network-isolated instance.
- RDS: creates a small private PostgreSQL instance.
- Lambda: creates a Lambda function and public Function URL; the GitHub workflow invokes it once.
- Bedrock: Terraform has no model-inference resource to create. The GitHub workflow invokes Amazon Nova Micro once through the Bedrock Runtime API and then queries the AWS Free Tier API for the authoritative activity status.

The credit resources are deliberately separate from `../` (the existing application deployment Terraform). They should not be destroyed until AWS reports the relevant account activities as `COMPLETED`.

## One-time new-account bootstrap

A brand-new AWS account cannot trust GitHub Actions before an IAM OIDC provider and role exist. `../bootstrap` creates that trust plus the versioned S3 Terraform state bucket. Run the bootstrap stack once from an authenticated AWS shell, then set its two outputs as repository variables:

- `AWS_CREDITS_ROLE_ARN`
- `AWS_TERRAFORM_STATE_BUCKET`

Optional repository variable:

- `AWS_BUDGET_EMAIL` for the AWS Budget notification subscriber.

After that, use the `AWS Free Tier credit activities` workflow with `apply`, `status`, and finally `destroy` only after AWS reports all activities complete.
