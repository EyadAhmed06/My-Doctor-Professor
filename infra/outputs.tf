output "application_url" {
  value = "https://${local.temporary_domain}"
  description = "Temporary HTTPS URL. Caddy may need a few minutes to obtain the certificate."
}
output "elastic_ip" { value = aws_eip.app.public_ip }
output "instance_id" { value = aws_instance.app.id }
output "github_actions_role_arn" {
  value = aws_iam_role.github_deploy.arn
  description = "Store this as the GitHub Actions variable AWS_DEPLOY_ROLE_ARN."
}
output "backend_ecr_repository" { value = aws_ecr_repository.backend.repository_url }
output "frontend_ecr_repository" { value = aws_ecr_repository.frontend.repository_url }
output "ssm_environment_parameter" { value = local.parameter_name }
output "backup_bucket" { value = aws_s3_bucket.backups.id }
