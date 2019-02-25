#!/bin/bash
set -eu

STACK="${1}"
PROFILE="${2}"
echo "Using Profile: $PROFILE..."
echo "Deleting static assets from: ${STACK}..."

BUCKET_NAME=$(aws \
  cloudformation describe-stacks \
  --stack-name "${STACK}" \
  --query "Stacks[0].Outputs[?OutputKey=='WebsiteBucket'] | [0].OutputValue" \
  --output text \
  --profile $PROFILE)

BUCKET_ONE=$(aws \
  cloudformation describe-stacks \
  --stack-name "${STACK}" \
  --query "Stacks[0].Outputs[?OutputKey=='BucketOne'] | [0].OutputValue" \
  --output text \
  --profile $PROFILE)

BUCKET_TWO=$(aws \
  cloudformation describe-stacks \
  --stack-name "${STACK}" \
  --query "Stacks[0].Outputs[?OutputKey=='BucketTwo'] | [0].OutputValue" \
  --output text \
  --profile $PROFILE)

mkdir /tmp/empty

aws s3 sync --delete /tmp/empty/ "s3://${BUCKET_NAME}/" --profile $PROFILE
aws s3 sync --delete /tmp/empty/ "s3://${BUCKET_ONE}/" --profile $PROFILE
aws s3 sync --delete /tmp/empty/ "s3://${BUCKET_TWO}/" --profile $PROFILE

rmdir /tmp/empty

echo "Bucket ${BUCKET_NAME} has been emptied"
