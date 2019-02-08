import dotProp from 'dot-prop-immutable';
import logger from './utils/logger';
import merge from './utils/deepmerge';
import DDB from './ddb';

const S3_SUFFIX = '.s3.amazonaws.com';
const ORIGIN_DOMAIN_DOTPATH = 'Records.0.cf.request.origin.s3.domainName';

const rerouteOrigin = async (opts = {}, handler, next) => {
  const { context } = handler;
  const { request } = handler.event.Records[0].cf;
  const { origin } = request;
  const [host] = getHeaderValues(['host'], request.headers);
  const s3DomainName = origin && origin.s3 && origin.s3.domainName;
  const originBucket =
    s3DomainName && s3DomainName.replace('.s3.amazonaws.com', '');

  const tableSuffix = '-domainmap';
  const functionSuffix = '-originrequest';
  const defaults = {
    functionSuffix,
    tableSuffix,
    tableName: getTableFromFunction(
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
    logger(`
      domainData: ${JSON.stringify(domainData)}
      ORIGIN_DOMAIN_DOTPATH: ${ORIGIN_DOMAIN_DOTPATH}
    `);
    const test = dotProp.set({}, ORIGIN_DOMAIN_DOTPATH, domainData.origin);
    console.log('dset:', JSON.stringify(test));
    handler.event = !!domainData ? merge(handler.event, test) : handler.event;
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
const getTableFromFunction = (functionName, functionSuffix, tableSuffix) => {
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
