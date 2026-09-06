output "terraform_state_bucket" {
  value       = aws_s3_bucket.terraform_state.id
  description = "Set this as the GitHub repository variable AWS_TERRAFORM_STATE_BUCKET."
}

output "github_credits_role_arn" {
  value       = aws_iam_role.github_credits_iac.arn
  description = "Set this as the GitHub repository variable AWS_CREDITS_ROLE_ARN."
}
