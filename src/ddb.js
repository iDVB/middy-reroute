import AWS from 'aws-sdk';
const DDB = new AWS.DynamoDB({
  apiVersion: '2012-08-10',
  region: 'us-east-1',
});

export default DDB;
