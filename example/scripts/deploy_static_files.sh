#!/bin/bash
set -eu

STACK="${1}"
PROFILE="${2}"
echo "Using Profile: $PROFILE..."
echo "Querying Stack: ${STACK}..."

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

DISTRIBUTION_ID=$(aws \
  cloudformation describe-stacks \
  --stack-name "${STACK}" \
  --query "Stacks[0].Outputs[?OutputKey=='DistributionId'] | [0].OutputValue" \
  --output text \
  --profile $PROFILE)

echo "Deploying static assets to Bucket: ${BUCKET_NAME}..."
aws s3 sync --delete ./public/defaultBucket "s3://${BUCKET_NAME}/" --cache-control 'max-age=0, no-cache, no-store, must-revalidate' --profile $PROFILE
echo "Deploy COMPLETE"

echo "Deploying static assets to Bucket: ${BUCKET_ONE}..."
aws s3 sync --delete ./public/bucketOne "s3://${BUCKET_ONE}/" --cache-control 'max-age=0, no-cache, no-store, must-revalidate' --profile $PROFILE
echo "Deploy COMPLETE"

echo "Deploying static assets to Bucket: ${BUCKET_TWO}..."
aws s3 sync --delete ./public/bucketTwo "s3://${BUCKET_TWO}/" --cache-control 'max-age=0, no-cache, no-store, must-revalidate' --profile $PROFILE
echo "Deploy COMPLETE"

if [ "${DISTRIBUTION_ID}" != "None" ]; then
echo "Invalidating Cloudfront Distro: ${DISTRIBUTION_ID}..."
aws configure set preview.cloudfront true --profile $PROFILE
aws cloudfront create-invalidation --distribution-id ${DISTRIBUTION_ID} --paths "/*" --profile $PROFILE
else
echo "No Cloudfront Distro to invalidate."
fi
