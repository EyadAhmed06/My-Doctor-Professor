variable "aws_region" {
  type    = string
  default = "eu-central-1"
}

variable "project_name" {
  type    = string
  default = "my-doctor-professor"
}

variable "environment" {
  type    = string
  default = "demo"
}

variable "instance_type" {
  description = "x86 instance selected for native Node dependency compatibility."
  type        = string
  default     = "t3.medium"
}

variable "root_volume_gb" {
  type    = number
  default = 40
}

variable "budget_limit_usd" {
  type    = number
  default = 112
}

variable "budget_email" {
  type    = string
  default = "eyadelmaleh07@gmail.com"
}

variable "github_repository" {
  type    = string
  default = "EyadAhmed06/My-Doctor-Professor"
}

variable "github_branch" {
  type    = string
  default = "agent/phase1-interactions"
}
