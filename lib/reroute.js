'use strict';

function _interopDefault (ex) { return (ex && (typeof ex === 'object') && 'default' in ex) ? ex['default'] : ex; }

var debug = _interopDefault(require('debug'));
var http = require('http');
var AWS = _interopDefault(require('aws-sdk'));
var axios = _interopDefault(require('axios'));
var merge = _interopDefault(require('deepmerge'));
var _find = _interopDefault(require('lodash.find'));
var _reduce = _interopDefault(require('lodash.reduce'));
var _omit = _interopDefault(require('lodash.omit'));
var _omitBy = _interopDefault(require('lodash.omitby'));
var url = require('url');
var path = _interopDefault(require('path'));
var pathMatch = _interopDefault(require('path-match'));
var NodeCache = _interopDefault(require('node-cache'));

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

function _slicedToArray(arr, i) {
  return _arrayWithHoles(arr) || _iterableToArrayLimit(arr, i) || _nonIterableRest();
}

function _arrayWithHoles(arr) {
  if (Array.isArray(arr)) return arr;
}

function _iterableToArrayLimit(arr, i) {
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

function _nonIterableRest() {
  throw new TypeError("Invalid attempt to destructure non-iterable instance");
}

const log = debug('reroute:log');
log.log = console.log.bind(console);

const S3 = new AWS.S3();

const deepmerge = (x, y, _ref = {}) => {
  let arrayMerge = _ref.arrayMerge,
      rest = _objectWithoutProperties(_ref, ["arrayMerge"]);

  return merge(x, y, _objectSpread({}, rest, {
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
    const value = this.cache.get(key);

    if (value) {
      return Promise.resolve(value);
    }

    return storeFunction().then(result => {
      this.cache.set(key, result, this.ttl);
      return result;
    });
  }

  del(keys) {
    this.cache.del(keys);
  }

  setDefaultTtl(ttl) {
    this.ttl = ttl;
  }

  delStartWith(startStr = '') {
    if (!startStr) {
      return;
    }

    const keys = this.cache.keys();
    var _iteratorNormalCompletion = true;
    var _didIteratorError = false;
    var _iteratorError = undefined;

    try {
      for (var _iterator = keys[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
        const key = _step.value;

        if (key.indexOf(startStr) === 0) {
          this.del(key);
        }
      }
    } catch (err) {
      _didIteratorError = true;
      _iteratorError = err;
    } finally {
      try {
        if (!_iteratorNormalCompletion && _iterator.return != null) {
          _iterator.return();
        }
      } finally {
        if (_didIteratorError) {
          throw _iteratorError;
        }
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
let options, originBucket, incomingHost;

const rerouteMiddleware =
/*#__PURE__*/
function () {
  var _ref = _asyncToGenerator(function* (opts = {}, handler, next) {
    const request = handler.event.Records[0].cf.request;
    const origin = request.origin;
    incomingHost = request.headers.host && request.headers.host[0] && request.headers.host[0].value;
    const s3DomainName = origin && origin.s3 && origin.s3.domainName;
    originBucket = s3DomainName && s3DomainName.replace('.s3.amazonaws.com', '');
    const defaults = {
      file: '_redirects',
      multiFile: false,
      rulesBucket: originBucket,
      regex: {
        htmlEnd: /(.*)\/((.*)\.html?)$/,
        ignoreRules: /^(?:#.*[\r\n]|\s*[\r\n])/gm,
        ruleline: /([^\s\r\n]+)(?:\s+)([^\s\r\n]+)(?:\s+(\d+)([!]?))?(?:(?:\s+)?([^\s\r\n]+))?/,
        absoluteUri: /^(?:[a-z]+:)?\/\//
      },
      defaultStatus: 301,
      redirectStatuses: [301, 302, 303],
      friendlyUrls: true,
      defaultDoc: `index.html`,
      custom404: `404.html`,
      cacheTtl: ttl
    };
    options = deepmerge(defaults, opts);
    cache.setDefaultTtl(options.cacheTtl);
    log(`
    Raw Event: ${JSON.stringify(handler.event)}
    Middleware Options: ${JSON.stringify(options)}
    Request Host: ${incomingHost}
    Request Origin: ${s3DomainName}`); // Origin must be S3

    if (!s3DomainName) throw new Error('Must use S3 as Origin');

    try {
      // Check if file exists
      const keyExists = yield doesKeyExist(request.uri); // Detect if needing friendly URLs

      const isUnFriendlyUrl = options.friendlyUrls && request.uri.match(options.regex.htmlEnd);
      let event; // Apply Friendly URLs if file doesn't exist
      // Do not apply any rules and Redirect

      if (!keyExists && isUnFriendlyUrl) {
        const _isUnFriendlyUrl = _slicedToArray(isUnFriendlyUrl, 4),
              first = _isUnFriendlyUrl[0],
              fullpath = _isUnFriendlyUrl[1],
              file = _isUnFriendlyUrl[2],
              filename = _isUnFriendlyUrl[3];

        const end = filename === 'index' ? '' : `${filename}/`;
        const finalKey = `${fullpath}/${end}`;
        log('UN-FriendlyURL [from:to]: ', request.uri, finalKey);
        event = redirect(finalKey, 301);
      } else {
        // Gather and parse rules
        const data = yield getRedirectData();
        log('Rules: ', data); // Find URI match in the rules

        const match = findMatch(data, request.uri);

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

    log('RETURNING EVENT!!!!');
    return;
  });

  return function rerouteMiddleware() {
    return _ref.apply(this, arguments);
  };
}(); ///////////////////////
// Utils     //
///////////////////////


const isRedirectURI = status => options.redirectStatuses.includes(status);

const isAbsoluteURI = to => {
  const test = options.regex.absoluteUri.test(to);
  log('isAbsoluteURI: ', test, to);
  return test;
};

const capitalizeParam = param => param.split('-').map(i => i.charAt(0).toUpperCase() + i.slice(1)).join('-');

const forceDefaultDoc = uri => path.extname(uri) === '' && !!options.defaultDoc ? path.join(uri, options.defaultDoc) : uri;

const lambdaReponseToObj = req => {
  const method = req.method,
        body = req.body;
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

const replacePlaceholders = (obj, pattern) => pattern.replace(/:(?!splat)(\w+)/g, (_, k) => obj[k]);

const replaceSplats = (obj, pattern) => _reduce(obj, (result, value, key) => result.replace(/(:splat)/g, (_, k) => obj[key]), pattern);

const replaceAll = (obj, pattern) => replaceSplats(obj, replacePlaceholders(obj, pattern));

const parseRules = stringFile => stringFile // remove empty and commented lines
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
    conditions
  };
});

const findMatch = (data, uri) => {
  let params;

  const match = _find(data, o => {
    const from = route(o.from);
    params = from(url.parse(uri).pathname);
    return params !== false;
  });

  return match && _objectSpread({}, match, {
    parsedTo: replaceAll(params, match.to)
  });
}; ///////////////////////
// Data Fetching     //
///////////////////////


const doesKeyExist = key => {
  const parsedKey = key.replace(/^\/+/, '');
  return S3.headObject({
    Bucket: originBucket,
    Key: parsedKey
  }).promise().then(data => {
    log('doesKeyExist FOUND: ', parsedKey);
    return true;
  }).catch(err => {
    if (err.errorType === 'NoSuchKey') {
      log('doesKeyExist NOT Found: ', parsedKey);
      return false;
    }

    log('doesKeyExist err: ', err);
    return false;
  });
};

const getRedirectData = () => {
  const Key = !options.multiFile ? options.file : `${options.file}_${incomingHost}`;

  const func = () => {
    log(`
      Getting Rules from: ${options.rules ? 'Options' : 'S3'}
      Bucket: ${options.rulesBucket}
      Key: ${Key}`);
    return options.rules ? parseRules(options.rules) : S3.getObject({
      Bucket: options.rulesBucket,
      Key
    }).promise().then(data => parseRules(data.Body.toString())).catch(err => {
      log('No _redirects file', err);
      return false;
    });
  };

  return options.cacheTtl > 0 ? cache.get(`getRedirectData_${Key}`, func) : func();
};

const getProxyResponse = resp => {
  const status = resp.status,
        statusText = resp.statusText,
        data = resp.data;
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

  const func = () => S3.getObject({
    Bucket: originBucket,
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
  });

  return options.cacheTtl > 0 ? cache.get(`get404Response_${Key}`, func) : func();
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

const rewrite =
/*#__PURE__*/
function () {
  var _ref2 = _asyncToGenerator(function* (to, host, event) {
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
    return _ref2.apply(this, arguments);
  };
}();

const proxy = (url$$1, event) => {
  log('PROXY start: ', url$$1);
  const request = event.Records[0].cf.request;

  const config = _objectSpread({}, lambdaReponseToObj(request), {
    validateStatus: null,
    url: url$$1
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

var index = (opts => ({
  before: rerouteMiddleware.bind(null, opts)
}));

module.exports = index;
//# sourceMappingURL=reroute.js.map
