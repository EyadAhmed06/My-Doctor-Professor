variable "aws_region" {
  description = "Use us-east-1 so the EC2/RDS/Lambda activities and Amazon Nova Bedrock invocation share one region."
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  type    = string
  default = "my-doctor-professor"
}

variable "budget_limit_usd" {
  description = "Small monthly guardrail budget created for the AWS Budgets credit activity."
  type        = number
  default     = 10
}

variable "budget_email" {
  description = "Optional email for the budget alert. Leave empty to create the budget without an email subscriber."
  type        = string
  default     = ""
}

variable "ec2_instance_type" {
  type    = string
  default = "t3.micro"
}

variable "rds_instance_class" {
  type    = string
  default = "db.t4g.micro"
}

variable "bedrock_model_id" {
  description = "Low-cost Amazon Bedrock model invoked by the workflow after Terraform apply."
  type        = string
  default     = "amazon.nova-micro-v1:0"
}
