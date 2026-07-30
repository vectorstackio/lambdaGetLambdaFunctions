#!/bin/bash

FUNCTION_NAME="getLambdaFunctions"

aws lambda update-function-code \
  --function-name $FUNCTION_NAME \
  --zip-file fileb://dist/function.zip

echo "Deployed to Lambda"
