import logger from './utils/logger';
import { STATUS_CODES } from 'http';
import S3 from './s3';
import axios from 'axios';
import merge, { all as mergeAll } from './utils/deepmerge';
import _find from 'lodash.find';
import _reduce from 'lodash.reduce';
import _omit from 'lodash.omit';
import _omitBy from 'lodash.omitby';
import { parse } from 'url';
import path from 'path';
import pathMatch from 'path-match';
import CacheService from './utils/cache-service';
import langParser from 'accept-language-parser';

const ttl = 300; // default TTL of 30 seconds
const cache = new CacheService(ttl);

const route = pathMatch({
  sensitive: false,
  strict: false,
  end: true,
});

let options;
const rerouteMiddleware = async (opts = {}, handler, next) => {
  const { request } = handler.event.Records[0].cf;
  const { origin } = request;
  const [host, country, language] = getHeaderValues(
    ['host', 'cloudfront-viewer-country', 'accept-language'],
    request.headers,
  );
  const s3DomainName = origin && origin.s3 && origin.s3.domainName;
  const originBucket =
    s3DomainName && s3DomainName.replace('.s3.amazonaws.com', '');
  const defaults = {
    file: '_redirects',
    rules: undefined,
    multiFile: false,
    rulesBucket: originBucket,
    regex: {
      htmlEnd: /(.*)\/((.*)\.html?)$/,
      ignoreRules: /^(?:\s*(?:#.*)*)$[\r\n]{0,1}|(?:#.*)*/gm,
      ruleline: /([^\s\r\n]+)(?:\s+)([^\s\r\n]+)(?:\s+(\d+)([!]?))?(?:(?:\s+)?([^\s\r\n]+))?/,
      absoluteUri: /^(?:[a-z]+:)?\/\//,
    },
    defaultStatus: 301,
    redirectStatuses: [301, 302, 303],
    friendlyUrls: true,
    defaultDoc: `index.html`,
    custom404: `404.html`,
    cacheTtl: ttl,
    incomingProtocol: 'https://',
  };
  options = mergeAll([
    defaults,
    opts,
    {
      originBucket,
      host,
      country,
      language,
    },
  ]);
  cache.setDefaultTtl(options.cacheTtl);

  logger(`
    Raw Event:
    ${JSON.stringify(handler.event)}

    Middleware Options:
    ${JSON.stringify(options)}
    ---- Request ----
    URI: ${request.uri}
    Host: ${options.host}
    Origin: ${s3DomainName}
    Country: ${options.country}
    Language: ${options.language}
    `);

  // Origin must be S3
  if (!s3DomainName) throw new Error('Must use S3 as Origin');

  try {
    // Check if file exists
    const keyExists = await doesKeyExist(request.uri);

    // Detect if needing friendly URLs
    const isUnFriendlyUrl =
      options.friendlyUrls && request.uri.match(options.regex.htmlEnd);

    let event;
    // Apply Friendly URLs if file doesn't exist
    // Do not apply any rules and Redirect
    if (!keyExists && isUnFriendlyUrl) {
      const [first, fullpath, file, filename] = isUnFriendlyUrl;
      const end = filename === 'index' ? '' : `${filename}/`;
      const finalKey = `${fullpath}/${end}`;
      logger('UN-FriendlyURL [from:to]: ', request.uri, finalKey);
      event = redirect(finalKey, 301);
    } else {
      // Gather and parse rules
      const data = await getRedirectData();
      logger('Rules: ', data);

      // Find URI match in the rules
      const match = findMatch(
        data,
        request.uri,
        host,
        options.incomingProtocol,
      );
      if (match) {
        logger('Match FOUND: ', match.parsedTo);
        // Match: match found
        // Use status to decide how to handle
        event = isRedirectURI(match.status)
          ? redirect(match.parsedTo, match.status)
          : isAbsoluteURI(match.parsedTo)
          ? await proxy(match.parsedTo, handler.event)
          : await rewrite(
              forceDefaultDoc(match.parsedTo),
              s3DomainName,
              handler.event,
            );
      } else {
        logger('NO Match');
        // Pass-Through: No match, so other then DefaultDoc, let it pass through
        event = await rewrite(
          forceDefaultDoc(request.uri),
          s3DomainName,
          handler.event,
        );
      }
    }

    handler.event = event;
  } catch (err) {
    logger('Throwing Error for main thread');
    throw err;
  }

  logger('RETURNING EVENT!!!!');
  return;
};

///////////////////////
// Utils     //
///////////////////////
const getHeaderValues = (paramArr, headers) =>
  paramArr.map(
    param => headers[param] && headers[param][0] && headers[param][0].value,
  );
const isRedirectURI = status => options.redirectStatuses.includes(status);

const isAbsoluteURI = to => {
  const test = options.regex.absoluteUri.test(to);
  logger('isAbsoluteURI: ', test, to);
  return test;
};

const capitalizeParam = param =>
  param
    .split('-')
    .map(i => i.charAt(0).toUpperCase() + i.slice(1))
    .join('-');

const forceDefaultDoc = uri =>
  path.extname(uri) === '' && !!options.defaultDoc
    ? path.join(uri, options.defaultDoc)
    : uri;

const lambdaReponseToObj = req => {
  const { method, body } = req;
  return {
    method,
    headers: _omit(
      _reduce(
        req.headers,
        (result, value, key) => ({ ...result, [value[0].key]: value[0].value }),
        {},
      ),
      ['Host'],
    ),
  };
};

const blacklistedHeaders = {
  exact: [
    'Connection',
    'Expect',
    'Keep-alive',
    'Proxy-Authenticate',
    'Proxy-Authorization',
    'Proxy-Connection',
    'Trailer',
    'Upgrade',
    'X-Accel-Buffering',
    'X-Accel-Charset',
    'X-Accel-Limit-Rate',
    'X-Accel-Redirect',
    'X-Cache',
    'X-Forwarded-Proto',
    'X-Real-IP',
    'Accept-Encoding',
    'Content-Length',
    'If-Modified-Since',
    'If-None-Match',
    'If-Range',
    'If-Unmodified-Since',
    'Range',
    'Transfer-Encoding',
    'Via',
  ],
  startsWith: ['X-Amzn-', 'X-Amz-Cf-', 'X-Edge-'],
};
const isBlacklistedProperty = name =>
  blacklistedHeaders.exact.includes(name) ||
  !!blacklistedHeaders.startsWith.find(i => name.startsWith(i));

///////////////////////
// Rules Parsing     //
///////////////////////
const replacePlaceholders = (obj, pattern) =>
  pattern.replace(/:(?!splat)(\w+)/g, (_, k) => obj[k]);

const replaceSplats = (obj, pattern) =>
  _reduce(
    obj,
    (result, value, key) => result.replace(/(:splat)/g, (_, k) => obj[key]),
    pattern,
  );

const replaceAll = (obj, pattern) =>
  replaceSplats(obj, replacePlaceholders(obj, pattern));

const parseConditions = conditions =>
  !!conditions
    ? conditions.split(';').reduce((results, next) => {
        const [key, value] = next.split('=');
        return { ...results, [key.toLowerCase()]: value.split(',') };
      }, {})
    : {};

const parseRules = stringFile => {
  logger('Parsing String: ', stringFile);
  return (
    stringFile
      // remove empty and commented lines
      .replace(options.regex.ignoreRules, '')
      // split all lines
      .split(/[\r\n]/gm)
      // strip out the last line break
      .filter(l => l !== '')
      .map(l => {
        // regex
        const [first, from, to, status, force, conditions] = l.match(
          options.regex.ruleline,
        );
        // restructure into object
        return {
          from,
          to,
          status: status ? parseInt(status, 10) : options.defaultStatus,
          force: !!force,
          conditions: parseConditions(conditions),
        };
      })
  );
};

const findMatch = (data, path, host, protocol) => {
  let params;
  const fullUri = host && `${protocol}${host}${path}`;
  const match = _find(data, o => {
    const from = route(o.from);
    params = isAbsoluteURI(o.from) ? from(fullUri) : from(parse(path).pathname);

    // If there specific language rules, do they match
    const languagePass = !!o.conditions.language
      ? !!options.language &&
        !!langParser.pick(o.conditions.language, options.language, {
          loose: true,
        })
      : true;

    // If there specific country rules, do they match
    const countryPass = !!o.conditions.country
      ? !!options.country && o.conditions.country.includes(options.country)
      : true;

    // Let's make sure all our conditions pass IF set
    const passesConditions = languagePass && countryPass;
    return params !== false && passesConditions;
  });
  return match && { ...match, parsedTo: replaceAll(params, match.to) };
};

///////////////////////
// Data Fetching     //
///////////////////////
const doesKeyExist = rawKey => {
  const Key = rawKey.replace(/^\/+/, '');
  return cache.get(`doesKeyExist_${Key}`, () =>
    S3.headObject({
      Bucket: options.originBucket,
      Key,
    })
      .promise()
      .then(data => {
        logger('doesKeyExist FOUND: ', Key);
        return true;
      })
      .catch(err => {
        if (err.errorType === 'NoSuchKey' || err.code === 'NotFound') {
          logger('doesKeyExist NOT Found: ', Key);
          return false;
        }
        logger('doesKeyExist err: ', err);
        return false;
      }),
  );
};

const getRedirectData = () => {
  const Key = !options.multiFile
    ? options.file
    : `${options.file}_${options.host}`;
  const cacheKey = `${options.rulesBucket}_${Key}`;
  return cache.get(`getRedirectData_${cacheKey}`, () => {
    logger(`
      Getting Rules from: ${options.rules ? 'Options' : 'S3'}
      Bucket: ${options.rulesBucket}
      Key: ${Key}`);
    return !!options.rules
      ? Promise.resolve(parseRules(options.rules))
      : S3.getObject({
          Bucket: options.rulesBucket,
          Key,
        })
          .promise()
          .then(data => parseRules(data.Body.toString()))
          .catch(err => {
            logger('No _redirects file', err);
            return false;
          });
  });
};

const getProxyResponse = resp => {
  const { status, statusText, data } = resp;
  logger('getProxyResponse raw headers: ', resp.headers);
  const headers = _omitBy(
    _reduce(
      resp.headers,
      (result, value, key) => ({
        ...result,
        [key]: [
          {
            key: capitalizeParam(key),
            value: resp.headers[key],
          },
        ],
      }),
      {},
    ),
    (value, key) => isBlacklistedProperty(value[0].key),
  );
  logger('getProxyResponse parse headers: ', headers);
  const response = {
    status,
    statusDescription: statusText,
    headers,
    body: JSON.stringify(data),
  };
  return response;
};

const get404Response = () => {
  const Key = options.custom404;
  return cache.get(`get404Response_${Key}`, () =>
    S3.getObject({
      Bucket: options.originBucket,
      Key,
    })
      .promise()
      .then(({ Body }) => {
        logger('Custom 404 FOUND');
        return {
          status: '404',
          statusDescription: STATUS_CODES['404'],
          headers: {
            'content-type': [
              {
                key: 'Content-Type',
                value: 'text/html',
              },
            ],
          },
          body: Body.toString(),
        };
      })
      .catch(err => {
        if (err.errorType === 'NoSuchKey') {
          logger('Custom 404 NOT Found');
        }
        logger('Get404ResponseErr', err);
        return false;
      }),
  );
};

///////////////////////////
// Event Generators     //
//////////////////////////
const redirect = (to, status) => {
  logger('Redirecting: ', to, status);
  return {
    status,
    statusDescription: STATUS_CODES[status],
    headers: {
      location: [{ key: 'Location', value: to }],
    },
  };
};

const rewrite = async (to, host, event) => {
  logger('Rewriting: ', to);
  const resp =
    (!isAbsoluteURI(to) &&
      !(await doesKeyExist(to)) &&
      (await get404Response())) ||
    merge(event, {
      Records: [
        {
          cf: {
            request: {
              headers: { host: [{ key: 'Host', value: host }] },
              uri: to,
            },
          },
        },
      ],
    });
  logger('Rewriting Event: ', JSON.stringify(resp));
  return resp;
};

const proxy = (url, event) => {
  logger('PROXY start: ', url);
  const { request } = event.Records[0].cf;
  const config = { ...lambdaReponseToObj(request), validateStatus: null, url };
  logger('PROXY config: ', config);
  return axios(config)
    .then(data => {
      logger('PROXY data: ', _omit(data, ['request', 'config']));
      return getProxyResponse(data);
    })
    .catch(err => {
      logger('PROXY err: ', err);
      throw err;
    });
};

export default opts => ({
  before: rerouteMiddleware.bind(null, opts),
});
