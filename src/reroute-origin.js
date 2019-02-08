import dotProp from 'dot-prop-immutable';
import logger from './utils/logger';
import merge from './utils/deepmerge';
import DDB from './ddb';

const S3_SUFFIX = '.s3.amazonaws.com';
const ORIGIN_S3_DOTPATH = 'Records.0.cf.request.origin.s3';

const rerouteOrigin = async (opts = {}, handler, next) => {
  const { context } = handler;
  const { request } = handler.event.Records[0].cf;
  const { origin } = request;
  const [host] = getHeaderValues(['host'], request.headers);
  const s3DomainName = origin && origin.s3 && origin.s3.domainName;
  const originBucket = s3DomainName && s3DomainName.replace(S3_SUFFIX, '');

  const tableSuffix = '-domainmap';
  const functionSuffix = '-originrequest';
  const defaults = {
    functionSuffix,
    tableSuffix,
    tableName: getTableFromFunctionName(
      context.functionName,
      functionSuffix,
      tableSuffix,
    ),
  };
  const options = merge(defaults, opts);

  logger(`
    Raw Event:
    ${JSON.stringify(handler.event)}

    Middleware Options:
    ${JSON.stringify(options)}
    ---- Request ----
    URI: ${request.uri}
    Host: ${host}
    Origin: ${s3DomainName}
    `);

  try {
    const domainData = await getDomainData(options.tableName, host);
    logger({ getDomainData: domainData });
    handler.event = !!domainData
      ? merge(
          handler.event,
          dotProp.set({}, ORIGIN_S3_DOTPATH, {
            region: domainData.region,
            domainName: `${domainData.origin}${S3_SUFFIX}`,
          }),
        )
      : handler.event;
  } catch (err) {
    logger('Throwing Error for main thread');
    throw err;
  }

  return;
};

export default opts => ({
  before: rerouteOrigin.bind(null, opts),
});

///////////////////////
// Utils     //
///////////////////////
const getHeaderValues = (paramArr, headers) =>
  paramArr.map(
    param => headers[param] && headers[param][0] && headers[param][0].value,
  );

// from:  us-east-1.marketing-stack-proxy-prod-viewerRequest
// to:    marketing-stack-proxy-prod-originmap
const getTableFromFunctionName = (
  functionName,
  functionSuffix,
  tableSuffix,
) => {
  const [rest, stackname] = functionName.match(
    `^us-east-1\.(.+)${functionSuffix}$`,
  );
  return `${stackname}${tableSuffix}`;
};

const getDomainData = (table, host) => {
  const params = {
    Key: {
      Host: {
        S: host,
      },
    },
    TableName: table,
  };
  logger('getDomainData', table);
  return DDB.getItem(params)
    .promise()
    .then(data => {
      return (
        data.Item &&
        data.Item.Origin &&
        data.Item.Origin.S && {
          host: data.Item.Host.S,
          origin: data.Item.Origin.S,
          region: data.Item.Region.S,
        }
      );
    });
};
