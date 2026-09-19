variable "aws_region" {
  description = "Production workload Region. Milan keeps the workload in Europe and relatively close to Egypt."
  type        = string
  default     = "eu-south-1"
}

variable "project_name" {
  type    = string
  default = "my-doctor-professor"
}

variable "environment" {
  type    = string
  default = "production"
}

variable "instance_type" {
  description = "EC2 size for the Dockerized Next.js + NestJS + PostgreSQL application host. c7i-flex.large keeps the existing x86_64 image/build path while providing 4 GiB RAM and is checked against AWS Free Tier eligibility by the production runner before plan/apply."
  type        = string
  default     = "c7i-flex.large"
}

variable "app_availability_zone" {
  description = "Availability Zone used by the production EC2 host and its dedicated PostgreSQL EBS volume. c7i-flex.large is offered in eu-south-1b/eu-south-1c, not eu-south-1a."
  type        = string
  default     = "eu-south-1b"
}

variable "root_volume_gb" {
  description = "Root gp3 volume for the OS, Docker images, and application runtime."
  type        = number
  default     = 40
}

variable "db_volume_gb" {
  description = "Dedicated encrypted gp3 EBS volume that stores PostgreSQL data independently from the EC2 root disk."
  type        = number
  default     = 30
}

variable "db_snapshot_retention_count" {
  description = "Number of daily EBS snapshots retained by the database lifecycle policy."
  type        = number
  default     = 7
}

variable "db_name" {
  type    = string
  default = "my_doctor_professor"
}

variable "db_username" {
  type    = string
  default = "mdp_app"
}

variable "budget_limit_usd" {
  type    = number
  default = 100
}

variable "budget_email" {
  type    = string
  default = "eyad.elmaleh1@gmail.com"
}

variable "github_repository" {
  type    = string
  default = "EyadAhmed06/My-Doctor-Professor"
}

variable "github_branches" {
  description = "Branches allowed to assume the production deploy role while the migration is being completed."
  type        = list(string)
  default = [
    "agent/phase1-interactions",
    "infra/aws-redeploy-iac",
  ]
}

variable "retain_backups" {
  description = "Keep the S3 logical-backup bucket if the stack is later torn down."
  type        = bool
  default     = true
}
