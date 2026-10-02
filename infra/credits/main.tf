data "aws_availability_zones" "available" {
  state = "available"
}

data "aws_ssm_parameter" "amazon_linux_2023" {
  name = "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64"
}

locals {
  name = "${var.project_name}-credits"
}

# Shared, isolated network for the EC2 and RDS credit activities. There is no
# Internet gateway or NAT gateway: neither activity requires inbound access.
resource "aws_vpc" "credits" {
  cidr_block           = "10.250.0.0/16"
  enable_dns_support   = true
  enable_dns_hostnames = true
}

resource "aws_subnet" "a" {
  vpc_id            = aws_vpc.credits.id
  cidr_block        = "10.250.1.0/24"
  availability_zone = data.aws_availability_zones.available.names[0]
}

resource "aws_subnet" "b" {
  vpc_id            = aws_vpc.credits.id
  cidr_block        = "10.250.2.0/24"
  availability_zone = data.aws_availability_zones.available.names[1]
}

resource "aws_security_group" "ec2" {
  name        = "${local.name}-ec2"
  description = "No inbound access; this instance exists only for the Free Tier EC2 activity."
  vpc_id      = aws_vpc.credits.id
}

resource "aws_instance" "credit_activity" {
  ami                         = data.aws_ssm_parameter.amazon_linux_2023.value
  instance_type               = var.ec2_instance_type
  subnet_id                   = aws_subnet.a.id
  vpc_security_group_ids      = [aws_security_group.ec2.id]
  associate_public_ip_address = false

  metadata_options {
    http_endpoint = "enabled"
    http_tokens   = "required"
  }

  root_block_device {
    volume_type           = "gp3"
    volume_size           = 8
    encrypted             = true
    delete_on_termination = true
  }

  tags = {
    Name = "${local.name}-ec2"
  }
}

resource "aws_db_subnet_group" "credit_activity" {
  name       = "${local.name}-rds"
  subnet_ids = [aws_subnet.a.id, aws_subnet.b.id]
}

resource "aws_security_group" "rds" {
  name        = "${local.name}-rds"
  description = "No public or application access; this DB exists only for the Free Tier RDS activity."
  vpc_id      = aws_vpc.credits.id
}

resource "random_password" "rds" {
  length  = 32
  special = false
}

resource "aws_db_instance" "credit_activity" {
  identifier = "${local.name}-postgres"

  engine         = "postgres"
  instance_class = var.rds_instance_class

  allocated_storage = 20
  storage_type      = "gp3"
  storage_encrypted = true

  db_name  = "creditcheck"
  username = "creditadmin"
  password = random_password.rds.result

  db_subnet_group_name   = aws_db_subnet_group.credit_activity.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  publicly_accessible    = false
  multi_az               = false

  backup_retention_period = 0
  deletion_protection     = false
  skip_final_snapshot     = true
  apply_immediately       = true
}

resource "aws_budgets_budget" "credit_activity" {
  name         = "${local.name}-monthly-guardrail"
  budget_type  = "COST"
  limit_amount = tostring(var.budget_limit_usd)
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  dynamic "notification" {
    for_each = var.budget_email == "" ? [] : [1]
    content {
      comparison_operator        = "GREATER_THAN"
      threshold                  = 80
      threshold_type             = "PERCENTAGE"
      notification_type          = "FORECASTED"
      subscriber_email_addresses = [var.budget_email]
    }
  }
}

resource "aws_iam_role" "lambda" {
  name = "${local.name}-lambda"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = {
        Service = "lambda.amazonaws.com"
      }
      Action = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "lambda_basic" {
  role       = aws_iam_role.lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

data "archive_file" "lambda" {
  type        = "zip"
  source_file = "${path.module}/lambda/index.py"
  output_path = "${path.module}/.terraform/credit-lambda.zip"
}

resource "aws_lambda_function" "credit_activity" {
  function_name = "${local.name}-web"
  role          = aws_iam_role.lambda.arn
  handler       = "index.handler"
  runtime       = "python3.12"
  architectures = ["arm64"]

  filename         = data.archive_file.lambda.output_path
  source_code_hash = data.archive_file.lambda.output_base64sha256

  memory_size = 128
  timeout     = 3

  depends_on = [aws_iam_role_policy_attachment.lambda_basic]
}

resource "aws_lambda_function_url" "credit_activity" {
  function_name      = aws_lambda_function.credit_activity.function_name
  authorization_type = "NONE"
}
