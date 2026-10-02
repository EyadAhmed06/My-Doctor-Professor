output "ec2_instance_id" {
  value = aws_instance.credit_activity.id
}

output "rds_instance_id" {
  value = aws_db_instance.credit_activity.identifier
}

output "budget_name" {
  value = aws_budgets_budget.credit_activity.name
}

output "lambda_function_name" {
  value = aws_lambda_function.credit_activity.function_name
}

output "lambda_function_url" {
  value = aws_lambda_function_url.credit_activity.function_url
}

output "bedrock_model_id" {
  value = var.bedrock_model_id
}
