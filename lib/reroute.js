'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

var AWS = require('aws-sdk');
var http = require('http');
var debug = require('debug');
var axios = require('axios');
var _find = require('lodash.find');
var _reduce = require('lodash.reduce');
var _omit = require('lodash.omit');
var _omitBy = require('lodash.omitby');
var url = require('url');
var path = require('path');
var pathMatch = require('path-match');
var langParser = require('accept-language-parser');
var UAParser = require('ua-parser-js');
var semver = require('semver');
var merge = require('deepmerge');
var NodeCache = require('node-cache');
var dotProp = require('dot-prop-immutable');

function _interopDefaultLegacy (e) { return e && typeof e === 'object' && 'default' in e ? e : { 'default': e }; }

var AWS__default = /*#__PURE__*/_interopDefaultLegacy(AWS);
var debug__default = /*#__PURE__*/_interopDefaultLegacy(debug);
var axios__default = /*#__PURE__*/_interopDefaultLegacy(axios);
var _find__default = /*#__PURE__*/_interopDefaultLegacy(_find);
var _reduce__default = /*#__PURE__*/_interopDefaultLegacy(_reduce);
var _omit__default = /*#__PURE__*/_interopDefaultLegacy(_omit);
var _omitBy__default = /*#__PURE__*/_interopDefaultLegacy(_omitBy);
var path__default = /*#__PURE__*/_interopDefaultLegacy(path);
var pathMatch__default = /*#__PURE__*/_interopDefaultLegacy(pathMatch);
var langParser__default = /*#__PURE__*/_interopDefaultLegacy(langParser);
var UAParser__default = /*#__PURE__*/_interopDefaultLegacy(UAParser);
var semver__default = /*#__PURE__*/_interopDefaultLegacy(semver);
var merge__default = /*#__PURE__*/_interopDefaultLegacy(merge);
var NodeCache__default = /*#__PURE__*/_interopDefaultLegacy(NodeCache);
var dotProp__default = /*#__PURE__*/_interopDefaultLegacy(dotProp);

function asyncGeneratorStep(gen, resolve, reject, _next, _throw, key, arg) {
  try {
    var info = gen[key](arg);
    var value = info.value;
  } catch (error) {
    reject(error);
    return;
  }

  if (info.done) {
    resolve(value);
  } else {
    Promise.resolve(value).then(_next, _throw);
  }
}

function _asyncToGenerator(fn) {
  return function () {
    var self = this,
        args = arguments;
    return new Promise(function (resolve, reject) {
      var gen = fn.apply(self, args);

      function _next(value) {
        asyncGeneratorStep(gen, resolve, reject, _next, _throw, "next", value);
      }

      function _throw(err) {
        asyncGeneratorStep(gen, resolve, reject, _next, _throw, "throw", err);
      }

      _next(undefined);
    });
  };
}

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

function ownKeys(object, enumerableOnly) {
  var keys = Object.keys(object);

  if (Object.getOwnPropertySymbols) {
    var symbols = Object.getOwnPropertySymbols(object);
    if (enumerableOnly) symbols = symbols.filter(function (sym) {
      return Object.getOwnPropertyDescriptor(object, sym).enumerable;
    });
    keys.push.apply(keys, symbols);
  }

  return keys;
}

function _objectSpread2(target) {
  for (var i = 1; i < arguments.length; i++) {
    var source = arguments[i] != null ? arguments[i] : {};

    if (i % 2) {
      ownKeys(Object(source), true).forEach(function (key) {
        _defineProperty(target, key, source[key]);
      });
    } else if (Object.getOwnPropertyDescriptors) {
      Object.defineProperties(target, Object.getOwnPropertyDescriptors(source));
    } else {
      ownKeys(Object(source)).forEach(function (key) {
        Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key));
      });
    }
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

function _slicedToArray(arr, i) {
  return _arrayWithHoles(arr) || _iterableToArrayLimit(arr, i) || _unsupportedIterableToArray(arr, i) || _nonIterableRest();
}

function _arrayWithHoles(arr) {
  if (Array.isArray(arr)) return arr;
}

function _iterableToArrayLimit(arr, i) {
  if (typeof Symbol === "undefined" || !(Symbol.iterator in Object(arr))) return;
  var _arr = [];
  var _n = true;
  var _d = false;
  var _e = undefined;

  try {
    for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) {
      _arr.push(_s.value);

      if (i && _arr.length === i) break;
    }
  } catch (err) {
    _d = true;
    _e = err;
  } finally {
    try {
      if (!_n && _i["return"] != null) _i["return"]();
    } finally {
      if (_d) throw _e;
    }
  }

  return _arr;
}

function _unsupportedIterableToArray(o, minLen) {
  if (!o) return;
  if (typeof o === "string") return _arrayLikeToArray(o, minLen);
  var n = Object.prototype.toString.call(o).slice(8, -1);
  if (n === "Object" && o.constructor) n = o.constructor.name;
  if (n === "Map" || n === "Set") return Array.from(o);
  if (n === "Arguments" || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(n)) return _arrayLikeToArray(o, minLen);
}

function _arrayLikeToArray(arr, len) {
  if (len == null || len > arr.length) len = arr.length;

  for (var i = 0, arr2 = new Array(len); i < len; i++) arr2[i] = arr[i];

  return arr2;
}

function _nonIterableRest() {
  throw new TypeError("Invalid attempt to destructure non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.");
}

function _createForOfIteratorHelper(o, allowArrayLike) {
  var it;

  if (typeof Symbol === "undefined" || o[Symbol.iterator] == null) {
    if (Array.isArray(o) || (it = _unsupportedIterableToArray(o)) || allowArrayLike && o && typeof o.length === "number") {
      if (it) o = it;
      var i = 0;

      var F = function () {};

      return {
        s: F,
        n: function () {
          if (i >= o.length) return {
            done: true
          };
          return {
            done: false,
            value: o[i++]
          };
        },
        e: function (e) {
          throw e;
        },
        f: F
      };
    }

    throw new TypeError("Invalid attempt to iterate non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.");
  }

  var normalCompletion = true,
      didErr = false,
      err;
  return {
    s: function () {
      it = o[Symbol.iterator]();
    },
    n: function () {
      var step = it.next();
      normalCompletion = step.done;
      return step;
    },
    e: function (e) {
      didErr = true;
      err = e;
    },
    f: function () {
      try {
        if (!normalCompletion && it.return != null) it.return();
      } finally {
        if (didErr) throw err;
      }
    }
  };
}

const log = debug__default['default']('reroute:log');
log.log = console.log.bind(console);

const deepmerge = (x, y, _ref = {}) => {
  let arrayMerge = _ref.arrayMerge,
      rest = _objectWithoutProperties(_ref, ["arrayMerge"]);

  return merge__default['default'](x, y, _objectSpread2(_objectSpread2({}, rest), {}, {
    arrayMerge: combineMerge
  }));
};

const all = (arr, _ref2 = {}) => {
  let arrayMerge = _ref2.arrayMerge,
      rest = _objectWithoutProperties(_ref2, ["arrayMerge"]);

  return merge__default['default'].all(arr, _objectSpread2(_objectSpread2({}, rest), {}, {
    arrayMerge: combineMerge
  }));
};

const emptyTarget = value => Array.isArray(value) ? [] : {};

const clone = (value, options) => merge__default['default'](emptyTarget(value), value, options);

const combineMerge = (target, source, options) => {
  const destination = target.slice();
  source.forEach((e, i) => {
    if (typeof destination[i] === 'undefined') {
      const cloneRequested = options.clone !== false;
      const shouldClone = cloneRequested && options.isMergeableObject(e);
      destination[i] = shouldClone ? clone(e, options) : e;
    } else if (options.isMergeableObject(e)) {
      destination[i] = merge__default['default'](target[i], e, options);
    } else if (target.indexOf(e) === -1) {
      destination.push(e);
    }
  });
  return destination;
};

class Cache {
  constructor(ttlSeconds) {
    this.cache = new NodeCache__default['default']({
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

    var _iterator = _createForOfIteratorHelper(keys),
        _step;

    try {
      for (_iterator.s(); !(_step = _iterator.n()).done;) {
        const key = _step.value;

        if (key.indexOf(startStr) === 0) {
          this.del(key);
        }
      }
    } catch (err) {
      _iterator.e(err);
    } finally {
      _iterator.f();
    }
  }

  flush() {
    this.cache.flushAll();
  }

}

const ttl = 300; // default TTL of 30 seconds

const cache = new Cache(ttl);
axios__default['default'].interceptors.response.use(function (response) {
  // Do something with response data
  return response;
}, function (error) {
  // Do something with response error
  return Promise.reject(error);
});
const route = pathMatch__default['default']({
  sensitive: false,
  strict: false,
  end: true
});
let options, S3;

const rerouteMiddleware = /*#__PURE__*/function () {
  var _ref = _asyncToGenerator(function* (opts = {}, handler, next) {
    const request = handler.event.Records[0].cf.request;
    const origin = request.origin;

    const _getHeaderValues = getHeaderValues(['host', 'cloudfront-viewer-country', 'accept-language', 'user-agent'], request.headers),
          _getHeaderValues2 = _slicedToArray(_getHeaderValues, 4),
          host = _getHeaderValues2[0],
          country = _getHeaderValues2[1],
          language = _getHeaderValues2[2],
          userAgent = _getHeaderValues2[3];

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
      incomingProtocol: 'https://',
      s3Options: {
        httpOptions: {
          connectTimeout: 2000
        }
      } // default 2 seconds

    };
    options = all([defaults, opts, {
      originBucket,
      host,
      country,
      language,
      userAgent
    }]);
    cache.setDefaultTtl(options.cacheTtl);
    S3 = S3 || new AWS__default['default'].S3(options.s3Options);
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
    UserAgent: ${options.userAgent}
    `); // Origin must be S3

    if (!s3DomainName) throw new Error('Must use S3 as Origin');

    try {
      // Check if file exists
      const keyExists = yield doesKeyExist(request.uri); // Detect if needing friendly URLs

      const isUnFriendlyUrl = options.friendlyUrls && request.uri.match(options.regex.htmlEnd);

      const _ref2 = isUnFriendlyUrl || [],
            _ref3 = _slicedToArray(_ref2, 4),
            first = _ref3[0],
            fullpath = _ref3[1],
            file = _ref3[2],
            filename = _ref3[3];

      const isIndex = filename === 'index';
      let event; // Apply Friendly URLs if file doesn't exist
      // Do not apply any rules and Redirect

      if (isUnFriendlyUrl && (!keyExists || isIndex)) {
        const end = isIndex ? '' : `${filename}/`;
        const finalKey = `${fullpath}/${end}`;
        log('UN-FriendlyURL [from:to]: ', request.uri, finalKey);
        event = redirect(finalKey, 301);
      } else {
        // Gather and parse rules
        const data = yield getRedirectData();
        log('Rules: ', data); // Find URI match in the rules

        const match = findMatch(data, request.uri, host, options.incomingProtocol);

        if (match) {
          log('Match FOUND: ', match.parsedTo); // Match: match found
          // Use status to decide how to handle

          event = isRedirectURI(match.status) ? redirect(match.parsedTo, match.status) : isAbsoluteURI(match.parsedTo) ? yield proxy(match.parsedTo, handler.event) : yield rewrite(forceDefaultDoc(match.parsedTo), s3DomainName, handler.event);
        } else {
          log('NO Match'); // Pass-Through: No match, so other then DefaultDoc, let it pass through

          event = yield rewrite(forceDefaultDoc(request.uri), s3DomainName, handler.event);
        }
      }

      handler.event = event;
    } catch (err) {
      log('Throwing Error for main thread');
      throw err;
    }

    log('RETURNING EVENT!!!!', handler.event);
    return;
  });

  return function rerouteMiddleware() {
    return _ref.apply(this, arguments);
  };
}(); ///////////////////////
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

const forceDefaultDoc = uri => path__default['default'].extname(uri) === '' && !!options.defaultDoc ? path__default['default'].join(uri, options.defaultDoc) : uri;

const lambdaReponseToObj = req => {
  const method = req.method,
        body = req.body;
  return {
    method,
    headers: _omit__default['default'](_reduce__default['default'](req.headers, (result, value, key) => _objectSpread2(_objectSpread2({}, result), {}, {
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

const replaceSplats = (obj, pattern) => _reduce__default['default'](obj, (result, value, key) => result.replace(/(:splat)/g, obj[key]), pattern).replace(/(:splat)/g, '');

const replaceAll = (obj, pattern) => replaceSplats(obj, replacePlaceholders(obj, pattern));

const parseConditions = conditions => !!conditions ? conditions.split(';').reduce((results, next) => {
  const _next$split = next.split(/([^=]*)=(.*)/),
        _next$split2 = _slicedToArray(_next$split, 3),
        unused = _next$split2[0],
        key = _next$split2[1],
        value = _next$split2[2];

  return _objectSpread2(_objectSpread2({}, results), {}, {
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
    const _l$match = l.match(options.regex.ruleline),
          _l$match2 = _slicedToArray(_l$match, 6),
          first = _l$match2[0],
          from = _l$match2[1],
          to = _l$match2[2],
          status = _l$match2[3],
          force = _l$match2[4],
          conditions = _l$match2[5]; // restructure into object


    return {
      from,
      to,
      status: status ? parseInt(status, 10) : options.defaultStatus,
      force: !!force,
      conditions: parseConditions(conditions)
    };
  });
};

const countryParser = (supportedCountryArray, acceptCountryHeader) => supportedCountryArray.map(c => c.toLowerCase()).includes(acceptCountryHeader.toLowerCase());

const userAgentParser = (testuserAgentArray, userAgentHeader) => {
  const _UAParser$browser = UAParser__default['default'](userAgentHeader).browser,
        browser = _UAParser$browser.name,
        version = _UAParser$browser.version;

  const match = _find__default['default'](testuserAgentArray, uaRule => {
    const _uaRule$split = uaRule.split(':'),
          _uaRule$split2 = _slicedToArray(_uaRule$split, 2),
          browserRule = _uaRule$split2[0],
          versionRule = _uaRule$split2[1];

    const cleanVersion = semver__default['default'].valid(semver__default['default'].coerce(version));
    const isVersion = semver__default['default'].satisfies(cleanVersion, versionRule);
    const isBrowser = browser === browserRule;
    const isMatch = isBrowser && isVersion;
    return isMatch;
  });

  return !!match;
};

const findMatch = (data, path, host, protocol) => {
  let params;
  const fullUri = host && `${protocol}${host}${path}`;

  const match = _find__default['default'](data, o => {
    const from = route(o.from);
    params = isAbsoluteURI(o.from) ? from(fullUri) : from(url.parse(path).pathname); // If there specific language rules, do they match

    const languagePass = !!o.conditions.language ? !!options.language && !!langParser__default['default'].pick(o.conditions.language, options.language, {
      loose: true
    }) : true; // If there specific country rules, do they match

    const countryPass = !!o.conditions.country ? !!options.country && countryParser(o.conditions.country, options.country) : true; // If there specific user-agent rules, do they match

    const agentPass = !!o.conditions.useragent ? !!options.userAgent && userAgentParser(o.conditions.useragent, options.userAgent) : true; // Let's make sure all our conditions pass IF set

    const passesConditions = languagePass && countryPass && agentPass;
    return params !== false && passesConditions;
  });

  return match && _objectSpread2(_objectSpread2({}, match), {}, {
    parsedTo: replaceAll(params, match.to)
  });
}; ///////////////////////
// Data Fetching     //
///////////////////////


const doesKeyExist = rawKey => {
  const Key = rawKey.replace(/^\/+([^\/])/, '$1');
  log('doesKeyExist: ', {
    Key,
    Bucket: options.originBucket
  });
  const cacheKey = `doesKeyExist_${options.rulesBucket}_${Key}`;
  return cache.get(cacheKey, () => S3.headObject({
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
  const cacheKey = `getRedirectData_${options.rulesBucket}_${Key}`;
  return cache.get(cacheKey, () => {
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
  const status = resp.status,
        statusDescription = resp.statusText,
        data = resp.data;
  log('getProxyResponse raw headers: ', resp.headers);

  const headers = _omitBy__default['default'](_reduce__default['default'](resp.headers, (result, value, key) => _objectSpread2(_objectSpread2({}, result), {}, {
    [key]: [{
      key: capitalizeParam(key),
      value: resp.headers[key]
    }]
  }), {}), (value, key) => isBlacklistedProperty(value[0].key));

  log('getProxyResponse parse headers: ', headers);
  const response = {
    status,
    statusDescription,
    headers,
    body: data.toString('base64'),
    bodyEncoding: 'base64'
  };
  return response;
};

const get404Response = () => {
  const Key = options.custom404;
  const cacheKey = `get404Response_${options.rulesBucket}_${Key}`;
  return cache.get(cacheKey, () => S3.getObject({
    Bucket: options.originBucket,
    Key
  }).promise().then(({
    Body
  }) => {
    log('Custom 404 FOUND');
    return {
      status: '404',
      statusDescription: http.STATUS_CODES['404'],
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
    statusDescription: http.STATUS_CODES[status],
    headers: {
      location: [{
        key: 'Location',
        value: to
      }]
    }
  };
};

const rewrite = /*#__PURE__*/function () {
  var _ref4 = _asyncToGenerator(function* (to, host, event) {
    log('Rewriting: ', to);
    const resp = !isAbsoluteURI(to) && !(yield doesKeyExist(to)) && (yield get404Response()) || deepmerge(event, {
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
  });

  return function rewrite(_x, _x2, _x3) {
    return _ref4.apply(this, arguments);
  };
}();

const proxy = (url, event) => {
  log('PROXY start: ', url);
  const request = event.Records[0].cf.request;

  const config = _objectSpread2(_objectSpread2({}, lambdaReponseToObj(request)), {}, {
    url,
    validateStatus: null,
    maxContentLength: 8000000,
    responseType: 'arraybuffer'
  });

  log('PROXY config: ', config);
  return axios__default['default'](config).then(resp => {
    log('PROXY data: ', _omit__default['default'](resp, ['request', 'config']));
    return getProxyResponse(resp);
  }).catch(err => {
    log('PROXY err: ', err);
    throw err;
  });
};

var reroute = (opts => ({
  before: rerouteMiddleware.bind(null, opts)
}));

const S3_SUFFIX = '.s3.amazonaws.com';
const ORIGIN_S3_DOTPATH = 'Records.0.cf.request.origin.s3';
const ttl$1 = 300; // default TTL of 30 seconds

const cache$1 = new Cache(ttl$1);
let DDB;

const rerouteOrigin = /*#__PURE__*/function () {
  var _ref = _asyncToGenerator(function* (opts = {}, handler, next) {
    const context = handler.context;
    const request = handler.event.Records[0].cf.request;
    const origin = request.origin;

    const _getHeaderValues = getHeaderValues$1(['host'], request.headers),
          _getHeaderValues2 = _slicedToArray(_getHeaderValues, 1),
          host = _getHeaderValues2[0];

    const s3DomainName = origin && origin.s3 && origin.s3.domainName;
    const originBucket = s3DomainName && s3DomainName.replace(S3_SUFFIX, '');
    const tableSuffix = '-domainmap';
    const functionSuffix = '-originrequest';
    const defaults = {
      functionSuffix,
      tableSuffix,
      tableName: getTableFromFunctionName(context.functionName, opts.functionSuffix || functionSuffix, opts.tableSuffix || tableSuffix),
      cacheTtl: ttl$1
    };
    const options = deepmerge(defaults, opts);
    cache$1.setDefaultTtl(options.cacheTtl);
    DDB = DDB || new AWS__default['default'].DynamoDB({
      apiVersion: '2012-08-10',
      region: 'us-east-1'
    });
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
      const domainData = yield getDomainData(options.tableName, host);
      log({
        domainData
      });
      handler.event = !!domainData ? dotProp__default['default'].merge(handler.event, ORIGIN_S3_DOTPATH, {
        region: domainData.region,
        domainName: domainData.origin
      }) : handler.event;
    } catch (err) {
      log('Throwing Error for main thread');
      throw err;
    }

    return;
  });

  return function rerouteOrigin() {
    return _ref.apply(this, arguments);
  };
}();

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

  const _ref2 = functionName.match(`^(?:us-east-1\.)?(.+)${functionSuffix}$`) || [],
        _ref3 = _slicedToArray(_ref2, 2),
        rest = _ref3[0],
        stackname = _ref3[1];

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

exports.reroute = reroute;
exports.rerouteOrigin = rerouteOrigin$1;
//# sourceMappingURL=reroute.js.map
