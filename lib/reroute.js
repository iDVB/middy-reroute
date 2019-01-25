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

const log = debug('reroute:log');
log.log = console.log.bind(console);

const S3 = new AWS.S3();

var _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; };

function _objectWithoutProperties(obj, keys) { var target = {}; for (var i in obj) { if (keys.indexOf(i) >= 0) continue; if (!Object.prototype.hasOwnProperty.call(obj, i)) continue; target[i] = obj[i]; } return target; }

const deepmerge = (x, y, _ref = {}) => {
  let arrayMerge = _ref.arrayMerge,
      rest = _objectWithoutProperties(_ref, ['arrayMerge']);

  return merge(x, y, _extends({}, rest, { arrayMerge: arrayMerge || combineMerge }));
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

var _extends$1 = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; };

var _slicedToArray = function () { function sliceIterator(arr, i) { var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i["return"]) _i["return"](); } finally { if (_d) throw _e; } } return _arr; } return function (arr, i) { if (Array.isArray(arr)) { return arr; } else if (Symbol.iterator in Object(arr)) { return sliceIterator(arr, i); } else { throw new TypeError("Invalid attempt to destructure non-iterable instance"); } }; }();

function _asyncToGenerator(fn) { return function () { var gen = fn.apply(this, arguments); return new Promise(function (resolve, reject) { function step(key, arg) { try { var info = gen[key](arg); var value = info.value; } catch (error) { reject(error); return; } if (info.done) { resolve(value); } else { return Promise.resolve(value).then(function (value) { step("next", value); }, function (err) { step("throw", err); }); } } return step("next"); }); }; }

const route = pathMatch({
  sensitive: false,
  strict: false,
  end: true
});

let options;
const rerouteMiddleware = (() => {
  var _ref = _asyncToGenerator(function* (opts = {}, handler, next) {
    const request = handler.event.Records[0].cf.request;
    const origin = request.origin;

    const defaults = {
      file: '_redirects',
      regex: {
        htmlEnd: /(.*)\/((.*)\.html?)$/,
        ignoreRules: /^(?:#.*[\r\n]|\s*[\r\n])/gm,
        ruleline: /([^\s\r\n]+)(?:\s+)([^\s\r\n]+)(?:\s+(\d+)([!]?))?/
      },
      defaultStatus: 301,
      redirectStatuses: [301, 302, 303],
      bucketName: origin.s3.domainName.replace('.s3.amazonaws.com', ''),
      friendlyUrls: true,
      defaultDoc: `index.html`,
      custom404: `404.html`
    };
    options = deepmerge(defaults, opts);
    log('options', options);

    log('REQUEST.URI: ', request.uri);

    try {
      // Check if file exists
      const keyExists = yield doesKeyExist(request.uri);

      // Check if there is a file with extension at the end of the path
      const isFile = path.extname(request.uri) !== '';
      // Detect if needing friendly URLs
      const isUnFriendlyUrl = options.friendlyUrls && request.uri.match(options.regex.htmlEnd);

      let event;
      // Apply Friendly URLs if file doesn't exist
      // Do not apply any rules and Redirect
      if (!keyExists && isUnFriendlyUrl) {
        var _isUnFriendlyUrl = _slicedToArray(isUnFriendlyUrl, 4);

        const first = _isUnFriendlyUrl[0],
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

        // Find URI match in the rules
        const match = findMatch(data, request.uri);
        if (match) {
          log('Match FOUND: ', match.parsedTo);
          // Match: match found
          // Use status to decide how to handle
          event = isRedirectURI(match.status) ? redirect(match.parsedTo, match.status) : isAbsoluteURI(match.parsedTo) ? yield proxy(match.parsedTo, handler.event) : yield rewrite(forceDefaultDoc(match.parsedTo), handler.event);
        } else {
          log('NO Match');
          // Pass-Through: No match, so other then DefaultDoc, let it pass through
          event = !isFile ? yield rewrite(forceDefaultDoc(request.uri), handler.event) : handler.event;
        }
      }

      handler.event = event;
    } catch (err) {
      throw err;
    }

    log('RETURNING EVENT!!!!');
    return;
  });

  return function rerouteMiddleware() {
    return _ref.apply(this, arguments);
  };
})();

const blacklistedHeaders = {
  exact: ['Connection', 'Expect', 'Keep-alive', 'Proxy-Authenticate', 'Proxy-Authorization', 'Proxy-Connection', 'Trailer', 'Upgrade', 'X-Accel-Buffering', 'X-Accel-Charset', 'X-Accel-Limit-Rate', 'X-Accel-Redirect', 'X-Cache', 'X-Forwarded-Proto', 'X-Real-IP', 'Accept-Encoding', 'Content-Length', 'If-Modified-Since', 'If-None-Match', 'If-Range', 'If-Unmodified-Since', 'Range', 'Transfer-Encoding', 'Via'],
  startsWith: ['X-Amzn-', 'X-Amz-Cf-', 'X-Edge-']
};

const isBlacklistedProperty = name => blacklistedHeaders.exact.includes(name) || !!blacklistedHeaders.startsWith.find(i => name.startsWith(i));

const isRedirectURI = status => options.redirectStatuses.includes(status);

const findMatch = (data, uri) => {
  let params;
  const match = _find(data, o => {
    const from = route(o.from);
    params = from(url.parse(uri).pathname);
    return params !== false;
  });
  return match && _extends$1({}, match, { parsedTo: replaceAll(params, match.to) });
};

const getRedirectData = () => {
  log('Getting Rules from: ', options.rules ? 'Options' : 'S3');
  return options.rules ? parseRules(options.rules) : S3.getObject({
    Bucket: options.bucketName,
    Key: options.file
  }).promise().then(data => parseRules(data.Body.toString()));
};

const parseRules = stringFile => stringFile
// remove empty and commented lines
.replace(options.regex.ignoreRules, '')
// split all lines
.split(/[\r\n]/gm)
// strip out the last line break
.filter(l => l !== '').map(l => {
  // regex
  var _l$match = l.match(options.regex.ruleline),
      _l$match2 = _slicedToArray(_l$match, 5);

  const first = _l$match2[0],
        from = _l$match2[1],
        to = _l$match2[2],
        status = _l$match2[3],
        force = _l$match2[4];
  // restructure into object

  return {
    from,
    to,
    status: status ? parseInt(status, 10) : options.defaultStatus,
    force: !!force
  };
});

const replaceAll = (obj, pattern) => replaceSplats(obj, replacePlaceholders(obj, pattern));

const replacePlaceholders = (obj, pattern) => pattern.replace(/:(?!splat)(\w+)/g, (_, k) => obj[k]);

const replaceSplats = (obj, pattern) => _reduce(obj, (result, value, key) => result.replace(/(:splat)/g, (_, k) => obj[key]), pattern);

const doesKeyExist = key => {
  return S3.headObject({
    Bucket: options.bucketName,
    Key: key.replace(/^\/+/, '')
  }).promise().then(data => {
    log('Key FOUND: ', key);
    return true;
  }).catch(err => {
    if (err.statusCode === 404) {
      log('Key NOT Found: ', key);
      return false;
    }
    throw err;
  });
};

const redirect = (to, status) => {
  log('Redirecting: ', to, status);
  return {
    status,
    statusDescription: http.STATUS_CODES[status],
    headers: {
      location: [{ key: 'Location', value: to }]
    }
  };
};

const rewrite = (() => {
  var _ref2 = _asyncToGenerator(function* (to, event) {
    log('Rewriting: ', to);
    const resp = !isAbsoluteURI(to) && !(yield doesKeyExist(to)) && (yield get404Response()) || deepmerge(event, { Records: [{ cf: { request: { uri: to } } }] });
    return resp;
  });

  return function rewrite(_x, _x2) {
    return _ref2.apply(this, arguments);
  };
})();

const proxy = (url$$1, event) => {
  log('PROXY start: ', url$$1);
  const request = event.Records[0].cf.request;

  const config = _extends$1({}, lambdaReponseToObj(request), { validateStatus: null });
  log('PROXY config: ', config);
  return axios(url$$1, config).then(data => {
    log('PROXY data: ', _omit(data, ['request', 'config']));
    return getProxyResponse(data);
  }).catch(err => {
    log('PROXY err: ', err);
    throw err;
  });
};

const lambdaReponseToObj = req => {
  const method = req.method,
        body = req.body;

  return {
    method,
    headers: _omit(_reduce(req.headers, (result, value, key) => _extends$1({}, result, { [value[0].key]: value[0].value }), {}), ['Host'])
  };
};

const isAbsoluteURI = to => {
  const test = /^(?:[a-z]+:)?\/\//.test(to);
  log('isAbsoluteURI: ', test, to);
  return test;
};

const forceDefaultDoc = uri => path.extname(uri) === '' ? path.join(uri, options.defaultDoc) : uri;

const getProxyResponse = resp => {
  const status = resp.status,
        statusText = resp.statusText,
        data = resp.data;

  log('getProxyResponse raw headers: ', resp.headers);
  const headers = _omitBy(_reduce(resp.headers, (result, value, key) => _extends$1({}, result, {
    [key]: [{
      key: key.replace(/(?<=-{1})(?:.)|^(?:.){1}/g, v => v.toUpperCase()),
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
  return S3.getObject({
    Bucket: options.bucketName,
    Key: options.custom404
  }).promise().then(({ Body }) => {
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
    if (err.statusCode === 404) {
      log('Custom 404 NOT Found');
      return false;
    }
    log('Custom 404 Exists');
    throw err;
  });
};

var index = (opts => ({
  before: rerouteMiddleware.bind(null, opts)
}));

module.exports = index;
//# sourceMappingURL=reroute.js.map
