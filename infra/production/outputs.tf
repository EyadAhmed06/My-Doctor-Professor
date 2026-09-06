output "application_url" {
  value       = "https://${local.temporary_domain}"
  description = "Temporary HTTPS URL backed by the production Elastic IP."
}

output "elastic_ip" {
  value = aws_eip.app.public_ip
}

output "instance_id" {
  value = aws_instance.app.id
}

output "database_volume_id" {
  value       = aws_ebs_volume.database.id
  description = "Protected persistent EBS volume containing PostgreSQL data."
}

output "database_snapshot_policy_id" {
  value       = aws_dlm_lifecycle_policy.database.id
  description = "Daily EBS snapshot lifecycle policy for the PostgreSQL volume."
}

output "github_actions_role_arn" {
  value       = aws_iam_role.github_deploy.arn
  description = "Store this as the GitHub repository variable AWS_DEPLOY_ROLE_ARN."
}

output "backend_ecr_repository" {
  value = aws_ecr_repository.backend.repository_url
}

output "frontend_ecr_repository" {
  value = aws_ecr_repository.frontend.repository_url
}

output "app_environment_parameter" {
  value = local.app_parameter_name
}

output "database_environment_parameter" {
  value = aws_ssm_parameter.database_env.name
}

output "backup_bucket" {
  value = aws_s3_bucket.backups.id
}
