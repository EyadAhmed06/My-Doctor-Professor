variable "aws_region" {
  description = "Region for EC2/RDS/Lambda workload resources. Europe (Milan) is selected for the Egypt-facing deployment."
  type        = string
  default     = "eu-south-1"
}

variable "project_name" {
  type    = string
  default = "my-doctor-professor"
}

variable "budget_limit_usd" {
  description = "Monthly cost budget amount matching the AWS Free Tier earning tutorial."
  type        = number
  default     = 100
}

variable "budget_email" {
  description = "Email subscriber for the AWS Budget alert. Automated apply paths require this value."
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
  description = "Low-cost Amazon Bedrock model invoked by automation in its dedicated Bedrock Region."
  type        = string
  default     = "amazon.nova-micro-v1:0"
}
