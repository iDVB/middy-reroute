import logger from './utils/logger';
import { STATUS_CODES } from 'http';
import S3 from './s3';
import axios from 'axios';
import merge from './utils/deepmerge';
import _find from 'lodash.find';
import _reduce from 'lodash.reduce';
import _omit from 'lodash.omit';
import _omitBy from 'lodash.omitby';
import { parse } from 'url';
import path from 'path';
import pathMatch from 'path-match';

const route = pathMatch({
  sensitive: false,
  strict: false,
  end: true,
});

let options;
const rerouteMiddleware = async (opts = {}, handler, next) => {
  const { request } = handler.event.Records[0].cf;
  const { origin } = request;
  const defaults = {
    file: '_redirects',
    regex: {
      htmlEnd: /(.*)\/((.*)\.html?)$/,
      ignoreRules: /^(?:#.*[\r\n]|\s*[\r\n])/gm,
      ruleline: /([^\s\r\n]+)(?:\s+)([^\s\r\n]+)(?:\s+(\d+)([!]?))?/,
    },
    defaultStatus: 301,
    redirectStatuses: [301, 302, 303],
    bucketName: origin.s3.domainName.replace('.s3.amazonaws.com', ''),
    friendlyUrls: true,
    defaultDoc: `index.html`,
    custom404: `404.html`,
  };
  options = merge(defaults, opts);
  logger('options', options);

  logger('REQUEST.URI: ', request.uri);

  try {
    // Check if file exists
    const keyExists = await doesKeyExist(request.uri);

    // Check if there is a file with extension at the end of the path
    const isFile = path.extname(request.uri) !== '';
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

      // Find URI match in the rules
      const match = findMatch(data, request.uri);
      if (match) {
        logger('Match FOUND: ', match.parsedTo);
        // Match: match found
        // Use status to decide how to handle
        event = isRedirectURI(match.status)
          ? redirect(match.parsedTo, match.status)
          : isAbsoluteURI(match.parsedTo)
          ? await proxy(match.parsedTo, handler.event)
          : await rewrite(forceDefaultDoc(match.parsedTo), handler.event);
      } else {
        logger('NO Match');
        // Pass-Through: No match, so other then DefaultDoc, let it pass through
        event = !isFile
          ? await rewrite(forceDefaultDoc(request.uri), handler.event)
          : handler.event;
      }
    }

    handler.event = event;
  } catch (err) {
    throw err;
  }

  logger('RETURNING EVENT!!!!');
  return;
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

const isRedirectURI = status => options.redirectStatuses.includes(status);

const findMatch = (data, uri) => {
  let params;
  const match = _find(data, o => {
    const from = route(o.from);
    params = from(parse(uri).pathname);
    return params !== false;
  });
  return match && { ...match, parsedTo: replaceAll(params, match.to) };
};

const getRedirectData = () => {
  logger('Getting Rules from: ', options.rules ? 'Options' : 'S3');
  return options.rules
    ? parseRules(options.rules)
    : S3.getObject({
        Bucket: options.bucketName,
        Key: options.file,
      })
        .promise()
        .then(data => parseRules(data.Body.toString()));
};

const parseRules = stringFile =>
  stringFile
    // remove empty and commented lines
    .replace(options.regex.ignoreRules, '')
    // split all lines
    .split(/[\r\n]/gm)
    // strip out the last line break
    .filter(l => l !== '')
    .map(l => {
      // regex
      const [first, from, to, status, force] = l.match(options.regex.ruleline);
      // restructure into object
      return {
        from,
        to,
        status: status ? parseInt(status, 10) : options.defaultStatus,
        force: !!force,
      };
    });

const replaceAll = (obj, pattern) =>
  replaceSplats(obj, replacePlaceholders(obj, pattern));

const replacePlaceholders = (obj, pattern) =>
  pattern.replace(/:(?!splat)(\w+)/g, (_, k) => obj[k]);

const replaceSplats = (obj, pattern) =>
  _reduce(
    obj,
    (result, value, key) => result.replace(/(:splat)/g, (_, k) => obj[key]),
    pattern,
  );

const doesKeyExist = key => {
  const parsedKey = key.replace(/^\/+/, '');
  return S3.headObject({
    Bucket: options.bucketName,
    Key: parsedKey,
  })
    .promise()
    .then(data => {
      logger('Key FOUND: ', parsedKey);
      return true;
    })
    .catch(err => {
      if (err.statusCode === 404) {
        logger('Key NOT Found: ', parsedKey);
        return false;
      }
      throw err;
    });
};

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

const rewrite = async (to, event) => {
  logger('Rewriting: ', to);
  const resp =
    (!isAbsoluteURI(to) &&
      !(await doesKeyExist(to)) &&
      (await get404Response())) ||
    merge(event, { Records: [{ cf: { request: { uri: to } } }] });
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

const isAbsoluteURI = to => {
  const test = /^(?:[a-z]+:)?\/\//.test(to);
  logger('isAbsoluteURI: ', test, to);
  return test;
};

const capitalizeParam = param =>
  param
    .split('-')
    .map(i => i.charAt(0).toUpperCase() + i.slice(1))
    .join('-');

const forceDefaultDoc = uri =>
  path.extname(uri) === '' ? path.join(uri, options.defaultDoc) : uri;

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
  return S3.getObject({
    Bucket: options.bucketName,
    Key: options.custom404,
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
      if (err.statusCode === 404) {
        logger('Custom 404 NOT Found');
      }
      logger('Get404ResponseErr', err);
      return false;
    });
};

export default opts => ({
  before: rerouteMiddleware.bind(null, opts),
});
