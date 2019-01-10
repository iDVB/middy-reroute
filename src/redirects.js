const STATUS_CODES = require('http').STATUS_CODES;
const AWS = require('aws-sdk');
const axios = require('axios');
const S3 = new AWS.S3();
const _find = require('lodash.find');
const _reduce = require('lodash.reduce');
const { parse } = require('url');
const route = require('path-match')({
  sensitive: false,
  strict: false,
  end: true,
});

const defaults = {
  file: '_redirects',
  regex: /([^\s\r\n]+)(?:\s+)([^\s\r\n]+)(?:\s+(\d+)([!]?))?/,
  defaultStatus: 301,
  redirectStatuses: [301, 302, 303],
};

let options;

const isRedirectURI = status => options.redirectStatuses.includes(status);

const redirectMiddleware = async (opts, handler, next) => {
  options = { ...defaults, ...opts };

  const { request, response } = handler.event.Records[0].cf;
  const { origin } = request;
  const bucketName =
    options.bucketName || origin.s3.domainName.replace('.s3.amazonaws.com', '');

  try {
    const data = await getRedirectData(bucketName, options.file);
    const match = findMatch(data, request.uri);

    handler.event =
      !match || (response && response.status === 200 && !match.force)
        ? handler.event
        : isRedirectURI(match.status)
        ? redirect(match.parsedTo, match.status)
        : await rewrite(match.parsedTo, handler.event);
  } catch (err) {
    handler.callback(null, err);
  }

  return next();
};

const promisifyStatic = value => {
  return new Promise(resolve => {
    setTimeout(() => {
      resolve(value);
    }, 10);
  });
};

const findMatch = (data, uri) => {
  let params;
  const match = _find(data, o => {
    const from = route(o.from);
    params = from(parse(uri).pathname);
    return params !== false;
  });
  return match && { ...match, parsedTo: replaceAll(params, match.to) };
};

const getRedirectData = (bucketName, key) =>
  options.rules
    ? promisifyStatic(options.rules).then(rules => parseRedirects(rules))
    : S3.getObject({
        Bucket: bucketName,
        Key: key,
      })
        .promise()
        .then(data => parseRedirects(data.Body.toString()));

const parseRedirects = stringFile =>
  stringFile
    // remove empty and commented lines
    .replace(/^(?:#.*[\r\n]|\s*[\r\n])/gm, '')
    // split all lines
    .split(/[\r\n]/gm)
    // strip out the last line break
    .filter(l => l !== '')
    .map(l => {
      // regex
      const [first, from, to, status, force] = l.match(options.regex);
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

const redirect = (to, status) => ({
  status,
  statusDescription: STATUS_CODES[status],
  headers: {
    location: [{ key: 'Location', value: to }],
  },
});

const rewrite = async (to, event) => {
  const reqRes = event.Records[0].cf;
  const { request } = reqRes;
  const isAbsoluteTo = /^(?:[a-z]+:)?\/\//.test(to);
  const proxyData = isAbsoluteTo && (await axios.get(to));

  if (proxyData) {
    const {
      headers,
      data: body,
      status,
      statusText: statusDescription,
    } = proxyData;
    reqRes.response = {
      status,
      headers,
      statusDescription,
      body,
    };
  } else {
    request.uri = to;
  }

  return event;
};

module.exports = opts => ({
  before: redirectMiddleware.bind(null, opts),
  // onError: redirectMiddleware.bind(null, opts),
});
