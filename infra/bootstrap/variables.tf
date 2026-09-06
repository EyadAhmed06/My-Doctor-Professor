variable "aws_region" {
  description = "Region that stores Terraform remote state."
  type        = string
  default     = "us-east-1"
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
