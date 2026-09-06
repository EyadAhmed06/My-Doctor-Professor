variable "aws_region" {
  description = "Control/state Region used for Terraform bootstrap resources. Keep this in us-east-1 because the existing remote state bucket already lives there."
  type        = string
  default     = "us-east-1"
}

variable "workload_region" {
  description = "Opt-in AWS Region for EC2/RDS/Lambda workload resources closest to Egypt in the chosen Middle East deployment design."
  type        = string
  default     = "me-south-1"
}

variable "project_name" {
  type    = string
  default = "my-doctor-professor"
}

variable "github_repository" {
  description = "GitHub repository allowed to assume the credits IaC role."
  type        = string
  default     = "EyadAhmed06/My-Doctor-Professor"
}

variable "github_branches" {
  description = "Branches allowed to assume the credits IaC role through GitHub OIDC."
  type        = list(string)
  default = [
    "agent/phase1-interactions",
    "infra/aws-redeploy-iac",
  ]
}
