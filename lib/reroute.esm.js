import debug from 'debug';
import { STATUS_CODES } from 'http';
import AWS from 'aws-sdk';
import axios from 'axios';
import merge from 'deepmerge';
import _find from 'lodash.find';
import _reduce from 'lodash.reduce';
import _omit from 'lodash.omit';
import _omitBy from 'lodash.omitby';
import { parse } from 'url';
import path from 'path';
import pathMatch from 'path-match';
import NodeCache from 'node-cache';
import langParser from 'accept-language-parser';
import dotProp from 'dot-prop-immutable';

function _defineProperty(obj, key, value) {
  if (key in obj) {
    Object.defineProperty(obj, key, {
      value: value,
      enumerable: true,
      configurable: true,
      writable: true
    });
  } else {
    obj[key] = value;
  }

  return obj;
}

function _objectSpread(target) {
  for (var i = 1; i < arguments.length; i++) {
    var source = arguments[i] != null ? arguments[i] : {};
    var ownKeys = Object.keys(source);

    if (typeof Object.getOwnPropertySymbols === 'function') {
      ownKeys = ownKeys.concat(Object.getOwnPropertySymbols(source).filter(function (sym) {
        return Object.getOwnPropertyDescriptor(source, sym).enumerable;
      }));
    }

    ownKeys.forEach(function (key) {
      _defineProperty(target, key, source[key]);
    });
  }

  return target;
}

function _objectWithoutPropertiesLoose(source, excluded) {
  if (source == null) return {};
  var target = {};
  var sourceKeys = Object.keys(source);
  var key, i;

  for (i = 0; i < sourceKeys.length; i++) {
    key = sourceKeys[i];
    if (excluded.indexOf(key) >= 0) continue;
    target[key] = source[key];
  }

  return target;
}

function _objectWithoutProperties(source, excluded) {
  if (source == null) return {};

  var target = _objectWithoutPropertiesLoose(source, excluded);

  var key, i;

  if (Object.getOwnPropertySymbols) {
    var sourceSymbolKeys = Object.getOwnPropertySymbols(source);

    for (i = 0; i < sourceSymbolKeys.length; i++) {
      key = sourceSymbolKeys[i];
      if (excluded.indexOf(key) >= 0) continue;
      if (!Object.prototype.propertyIsEnumerable.call(source, key)) continue;
      target[key] = source[key];
    }
  }

  return target;
}

const log = debug('reroute:log');
log.log = console.log.bind(console);

const S3 = new AWS.S3();

const deepmerge = (x, y, _ref = {}) => {
  let rest = _objectWithoutProperties(_ref, ["arrayMerge"]);

  return merge(x, y, _objectSpread({}, rest, {
    arrayMerge: combineMerge
  }));
};

const all = (arr, _ref2 = {}) => {
  let rest = _objectWithoutProperties(_ref2, ["arrayMerge"]);

  return merge.all(arr, _objectSpread({}, rest, {
    arrayMerge: combineMerge
  }));
};

const emptyTarget = value => Array.isArray(value) ? [] : {};

const clone = (value, options) => merge(emptyTarget(value), value, options);

const combineMerge = (target, source, options) => {
  const destination = target.slice();
  source.forEach((e, i) => {
    if (typeof destination[i] === 'undefined') {
      const cloneRequested = options.clone !== false;
      const shouldClone = cloneRequested && options.isMergeableObject(e);
      destination[i] = shouldClone ? clone(e, options) : e;
    } else if (options.isMergeableObject(e)) {
      destination[i] = merge(target[i], e, options);
    } else if (target.indexOf(e) === -1) {
      destination.push(e);
    }
  });
  return destination;
};

class Cache {
  constructor(ttlSeconds) {
    this.cache = new NodeCache({
      stdTTL: ttlSeconds,
      checkperiod: ttlSeconds * 0.2,
      useClones: false
    });
    this.ttl = ttlSeconds;
  }

  get(key, storeFunction) {
    if (this.ttl > 0) {
      const value = this.cache.get(key);

      if (value) {
        return Promise.resolve(value);
      }
    }

    return storeFunction().then(result => {
      this.ttl > 0 && this.cache.set(key, result, this.ttl);
      return result;
    });
  }

  del(keys) {
    this.cache.del(keys);
  }

  setDefaultTtl(ttl) {
    this.ttl = ttl;
    this.ttl === 0 && this.flush();
  }

  delStartWith(startStr = '') {
    if (!startStr) {
      return;
    }

    const keys = this.cache.keys();

    for (const key of keys) {
      if (key.indexOf(startStr) === 0) {
        this.del(key);
      }
    }
  }

  flush() {
    this.cache.flushAll();
  }

}

const ttl = 300; // default TTL of 30 seconds

const cache = new Cache(ttl);
const route = pathMatch({
  sensitive: false,
  strict: false,
  end: true
});
let options;

const rerouteMiddleware = async (opts = {}, handler, next) => {
  const {
    request
  } = handler.event.Records[0].cf;
  const {
    origin
  } = request;
  const [host, country, language] = getHeaderValues(['host', 'cloudfront-viewer-country', 'accept-language'], request.headers);
  const s3DomainName = origin && origin.s3 && origin.s3.domainName;
  const originBucket = s3DomainName && s3DomainName.replace('.s3.amazonaws.com', '');
  const defaults = {
    file: '_redirects',
    rules: undefined,
    multiFile: false,
    rulesBucket: originBucket,
    regex: {
      htmlEnd: /(.*)\/((.*)\.html?)$/,
      ignoreRules: /^(?:\s*(?:#.*)*)$[\r\n]{0,1}|(?:#.*)*/gm,
      ruleline: /([^\s\r\n]+)(?:\s+)([^\s\r\n]+)(?:\s+(\d+)([!]?))?(?:(?:\s+)?([^\s\r\n]+))?/,
      absoluteUri: /^(?:[a-z]+:)?\/\//
    },
    defaultStatus: 301,
    redirectStatuses: [301, 302, 303],
    friendlyUrls: true,
    defaultDoc: `index.html`,
    custom404: `404.html`,
    cacheTtl: ttl,
    incomingProtocol: 'https://'
  };
  options = all([defaults, opts, {
    originBucket,
    host,
    country,
    language
  }]);
  cache.setDefaultTtl(options.cacheTtl);
  log(`
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
    `); // Origin must be S3

  if (!s3DomainName) throw new Error('Must use S3 as Origin');

  try {
    // Check if file exists
    const keyExists = await doesKeyExist(request.uri); // Detect if needing friendly URLs

    const isUnFriendlyUrl = options.friendlyUrls && request.uri.match(options.regex.htmlEnd);
    let event; // Apply Friendly URLs if file doesn't exist
    // Do not apply any rules and Redirect

    if (!keyExists && isUnFriendlyUrl) {
      const [first, fullpath, file, filename] = isUnFriendlyUrl;
      const end = filename === 'index' ? '' : `${filename}/`;
      const finalKey = `${fullpath}/${end}`;
      log('UN-FriendlyURL [from:to]: ', request.uri, finalKey);
      event = redirect(finalKey, 301);
    } else {
      // Gather and parse rules
      const data = await getRedirectData();
      log('Rules: ', data); // Find URI match in the rules

      const match = findMatch(data, request.uri, host, options.incomingProtocol);

      if (match) {
        log('Match FOUND: ', match.parsedTo); // Match: match found
        // Use status to decide how to handle

        event = isRedirectURI(match.status) ? redirect(match.parsedTo, match.status) : isAbsoluteURI(match.parsedTo) ? await proxy(match.parsedTo, handler.event) : await rewrite(forceDefaultDoc(match.parsedTo), s3DomainName, handler.event);
      } else {
        log('NO Match'); // Pass-Through: No match, so other then DefaultDoc, let it pass through

        event = await rewrite(forceDefaultDoc(request.uri), s3DomainName, handler.event);
      }
    }

    handler.event = event;
  } catch (err) {
    log('Throwing Error for main thread');
    throw err;
  }

  log('RETURNING EVENT!!!!');
  return;
}; ///////////////////////
// Utils     //
///////////////////////


const getHeaderValues = (paramArr, headers) => paramArr.map(param => headers[param] && headers[param][0] && headers[param][0].value);

const isRedirectURI = status => options.redirectStatuses.includes(status);

const isAbsoluteURI = to => {
  const test = options.regex.absoluteUri.test(to);
  log('isAbsoluteURI: ', test, to);
  return test;
};

const capitalizeParam = param => param.split('-').map(i => i.charAt(0).toUpperCase() + i.slice(1)).join('-');

const forceDefaultDoc = uri => path.extname(uri) === '' && !!options.defaultDoc ? path.join(uri, options.defaultDoc) : uri;

const lambdaReponseToObj = req => {
  const {
    method,
    body
  } = req;
  return {
    method,
    headers: _omit(_reduce(req.headers, (result, value, key) => _objectSpread({}, result, {
      [value[0].key]: value[0].value
    }), {}), ['Host'])
  };
};

const blacklistedHeaders = {
  exact: ['Connection', 'Expect', 'Keep-alive', 'Proxy-Authenticate', 'Proxy-Authorization', 'Proxy-Connection', 'Trailer', 'Upgrade', 'X-Accel-Buffering', 'X-Accel-Charset', 'X-Accel-Limit-Rate', 'X-Accel-Redirect', 'X-Cache', 'X-Forwarded-Proto', 'X-Real-IP', 'Accept-Encoding', 'Content-Length', 'If-Modified-Since', 'If-None-Match', 'If-Range', 'If-Unmodified-Since', 'Range', 'Transfer-Encoding', 'Via'],
  startsWith: ['X-Amzn-', 'X-Amz-Cf-', 'X-Edge-']
};

const isBlacklistedProperty = name => blacklistedHeaders.exact.includes(name) || !!blacklistedHeaders.startsWith.find(i => name.startsWith(i)); ///////////////////////
// Rules Parsing     //
///////////////////////


const replacePlaceholders = (obj, pattern) => pattern.replace(/:(?!splat)(\w+)/g, (_, k) => obj[k]);

const replaceSplats = (obj, pattern) => _reduce(obj, (result, value, key) => result.replace(/(:splat)/g, (_, k) => obj[key]), pattern);

const replaceAll = (obj, pattern) => replaceSplats(obj, replacePlaceholders(obj, pattern));

const parseConditions = conditions => !!conditions ? conditions.split(';').reduce((results, next) => {
  const [key, value] = next.split('=');
  return _objectSpread({}, results, {
    [key.toLowerCase()]: value.split(',')
  });
}, {}) : {};

const parseRules = stringFile => {
  log('Parsing String: ', stringFile);
  return stringFile // remove empty and commented lines
  .replace(options.regex.ignoreRules, '') // split all lines
  .split(/[\r\n]/gm) // strip out the last line break
  .filter(l => l !== '').map(l => {
    // regex
    const [first, from, to, status, force, conditions] = l.match(options.regex.ruleline); // restructure into object

    return {
      from,
      to,
      status: status ? parseInt(status, 10) : options.defaultStatus,
      force: !!force,
      conditions: parseConditions(conditions)
    };
  });
};

const findMatch = (data, path$$1, host, protocol) => {
  let params;
  const fullUri = host && `${protocol}${host}${path$$1}`;

  const match = _find(data, o => {
    const from = route(o.from);
    params = isAbsoluteURI(o.from) ? from(fullUri) : from(parse(path$$1).pathname); // If there specific language rules, do they match

    const languagePass = !!o.conditions.language ? !!options.language && !!langParser.pick(o.conditions.language, options.language, {
      loose: true
    }) : true; // If there specific country rules, do they match

    const countryPass = !!o.conditions.country ? !!options.country && o.conditions.country.includes(options.country) : true; // Let's make sure all our conditions pass IF set

    const passesConditions = languagePass && countryPass;
    return params !== false && passesConditions;
  });

  return match && _objectSpread({}, match, {
    parsedTo: replaceAll(params, match.to)
  });
}; ///////////////////////
// Data Fetching     //
///////////////////////


const doesKeyExist = rawKey => {
  const Key = rawKey.replace(/^\/+/, '');
  return cache.get(`doesKeyExist_${Key}`, () => S3.headObject({
    Bucket: options.originBucket,
    Key
  }).promise().then(data => {
    log('doesKeyExist FOUND: ', Key);
    return true;
  }).catch(err => {
    if (err.errorType === 'NoSuchKey' || err.code === 'NotFound') {
      log('doesKeyExist NOT Found: ', Key);
      return false;
    }

    log('doesKeyExist err: ', err);
    return false;
  }));
};

const getRedirectData = () => {
  const Key = !options.multiFile ? options.file : `${options.file}_${options.host}`;
  const cacheKey = `${options.rulesBucket}_${Key}`;
  return cache.get(`getRedirectData_${cacheKey}`, () => {
    log(`
      Getting Rules from: ${options.rules ? 'Options' : 'S3'}
      Bucket: ${options.rulesBucket}
      Key: ${Key}`);
    return !!options.rules ? Promise.resolve(parseRules(options.rules)) : S3.getObject({
      Bucket: options.rulesBucket,
      Key
    }).promise().then(data => parseRules(data.Body.toString())).catch(err => {
      log('No _redirects file', err);
      return false;
    });
  });
};

const getProxyResponse = resp => {
  const {
    status,
    statusText,
    data
  } = resp;
  log('getProxyResponse raw headers: ', resp.headers);

  const headers = _omitBy(_reduce(resp.headers, (result, value, key) => _objectSpread({}, result, {
    [key]: [{
      key: capitalizeParam(key),
      value: resp.headers[key]
    }]
  }), {}), (value, key) => isBlacklistedProperty(value[0].key));

  log('getProxyResponse parse headers: ', headers);
  const response = {
    status,
    statusDescription: statusText,
    headers,
    body: JSON.stringify(data)
  };
  return response;
};

const get404Response = () => {
  const Key = options.custom404;
  return cache.get(`get404Response_${Key}`, () => S3.getObject({
    Bucket: options.originBucket,
    Key
  }).promise().then(({
    Body
  }) => {
    log('Custom 404 FOUND');
    return {
      status: '404',
      statusDescription: STATUS_CODES['404'],
      headers: {
        'content-type': [{
          key: 'Content-Type',
          value: 'text/html'
        }]
      },
      body: Body.toString()
    };
  }).catch(err => {
    if (err.errorType === 'NoSuchKey') {
      log('Custom 404 NOT Found');
    }

    log('Get404ResponseErr', err);
    return false;
  }));
}; ///////////////////////////
// Event Generators     //
//////////////////////////


const redirect = (to, status) => {
  log('Redirecting: ', to, status);
  return {
    status,
    statusDescription: STATUS_CODES[status],
    headers: {
      location: [{
        key: 'Location',
        value: to
      }]
    }
  };
};

const rewrite = async (to, host, event) => {
  log('Rewriting: ', to);
  const resp = !isAbsoluteURI(to) && !(await doesKeyExist(to)) && (await get404Response()) || deepmerge(event, {
    Records: [{
      cf: {
        request: {
          headers: {
            host: [{
              key: 'Host',
              value: host
            }]
          },
          uri: to
        }
      }
    }]
  });
  log('Rewriting Event: ', JSON.stringify(resp));
  return resp;
};

const proxy = (url, event) => {
  log('PROXY start: ', url);
  const {
    request
  } = event.Records[0].cf;

  const config = _objectSpread({}, lambdaReponseToObj(request), {
    validateStatus: null,
    url
  });

  log('PROXY config: ', config);
  return axios(config).then(data => {
    log('PROXY data: ', _omit(data, ['request', 'config']));
    return getProxyResponse(data);
  }).catch(err => {
    log('PROXY err: ', err);
    throw err;
  });
};

var reroute = (opts => ({
  before: rerouteMiddleware.bind(null, opts)
}));

const DDB = new AWS.DynamoDB({
  apiVersion: '2012-08-10',
  region: 'us-east-1'
});

const S3_SUFFIX = '.s3.amazonaws.com';
const ORIGIN_S3_DOTPATH = 'Records.0.cf.request.origin.s3';
const ttl$1 = 300; // default TTL of 30 seconds

const cache$1 = new Cache(ttl$1);

const rerouteOrigin = async (opts = {}, handler, next) => {
  const {
    context
  } = handler;
  const {
    request
  } = handler.event.Records[0].cf;
  const {
    origin
  } = request;
  const [host] = getHeaderValues$1(['host'], request.headers);
  const s3DomainName = origin && origin.s3 && origin.s3.domainName;
  const originBucket = s3DomainName && s3DomainName.replace(S3_SUFFIX, '');
  const tableSuffix = '-domainmap';
  const functionSuffix = '-originrequest';
  const defaults = {
    functionSuffix,
    tableSuffix,
    tableName: getTableFromFunctionName(context.functionName, functionSuffix, tableSuffix),
    cacheTtl: ttl$1
  };
  const options = deepmerge(defaults, opts);
  cache$1.setDefaultTtl(options.cacheTtl);
  log(`
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
    log({
      domainData
    });
    handler.event = !!domainData ? dotProp.merge(handler.event, ORIGIN_S3_DOTPATH, {
      region: domainData.region,
      domainName: domainData.origin
    }) : handler.event;
  } catch (err) {
    log('Throwing Error for main thread');
    throw err;
  }

  return;
};

var rerouteOrigin$1 = (opts => ({
  before: rerouteOrigin.bind(null, opts)
})); ///////////////////////
// Utils     //
///////////////////////

const getHeaderValues$1 = (paramArr, headers) => paramArr.map(param => headers[param] && headers[param][0] && headers[param][0].value); // from:  us-east-1.myproject-prod-originrequest
// to:    myproject-prod-domainmap


const getTableFromFunctionName = (functionName, functionSuffix, tableSuffix) => {
  log(`
  getTableFromFunctionName:
  ${JSON.stringify({
    functionName,
    functionSuffix,
    tableSuffix
  })}
  `);
  const [rest, stackname] = functionName.match(`^(?:us-east-1\.)?(.+)${functionSuffix}$`) || [];
  return `${stackname}${tableSuffix}`;
};

const getDomainData = (table, host) => cache$1.get(`getDomainData_${host}`, () => DDB.getItem({
  Key: {
    Host: {
      S: host
    }
  },
  TableName: table
}).promise().then(data => {
  log(`
      getDomainData: 
      ${JSON.stringify(data)}`);
  return data.Item && data.Item.Origin && data.Item.Origin.S && {
    host: data.Item.Host.S,
    origin: data.Item.Origin.S,
    region: data.Item.Region && data.Item.Region.S || 'us-east-1'
  };
}));

export { reroute, rerouteOrigin$1 as rerouteOrigin };
//# sourceMappingURL=reroute.esm.js.map
