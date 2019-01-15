const STATUS_CODES = require('http').STATUS_CODES;
const S3 = require('./storageProvider');
const axios = require('axios');
const _find = require('lodash.find');
const _reduce = require('lodash.reduce');
const { parse } = require('url');
const path = require('path');
const route = require('path-match')({
  sensitive: false,
  strict: false,
  end: true,
});

let options;

const isRedirectURI = status => options.redirectStatuses.includes(status);

const redirectMiddleware = async (opts, handler, next) => {
  const { request } = handler.event.Records[0].cf;
  const { origin } = request;
  const defaults = {
    file: '_redirects',
    regex: {
      htmlEnd: /(.*)\.html?$/g,
      ignoreRules: /^(?:#.*[\r\n]|\s*[\r\n])/gm,
      ruleline: /([^\s\r\n]+)(?:\s+)([^\s\r\n]+)(?:\s+(\d+)([!]?))?/,
    },
    defaultStatus: 301,
    redirectStatuses: [301, 302, 303],
    bucketName: origin.s3.domainName.replace('.s3.amazonaws.com', ''),
    friendlyUrls: true,
  };
  options = { ...defaults, ...opts };

  try {
    const data = await getRedirectData();
    const match = findMatch(data, request.uri);

    // Implement friendly URls
    const [isHtmlFile, fullpath, file, filename] = request.uri.match(
      /(.*)\/((.*)\.html?)$/,
    );

    let parsed;
    if (isHtmlFile && options.friendlyUrls) {
      const end = filename === 'index' ? '' : `${filename}/`;
      parsed = {
        parsedTo: `${fullpath}/${end}`,
        status: 301,
      };
    }

    const matchParsed = {
      ...match,
      ...parsed,
    };

    handler.event =
      // If no matching rule
      !match
        ? handler.event
        : isRedirectURI(matchParsed.status)
        ? redirect(matchParsed.parsedTo, matchParsed.status)
        : await rewrite(matchParsed.parsedTo, handler.event);
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

const getRedirectData = () =>
  options.rules
    ? promisifyStatic(options.rules).then(rules => parseRules(rules))
    : S3.getObject({
        Bucket: options.bucketName,
        Key: options.file,
      })
        .promise()
        .then(data => parseRules(data.Body.toString()));

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

const doesKeyExist = key =>
  S3.headObject({
    Bucket: options.bucketName,
    Key: key.replace(/^\/+/, ''),
  })
    .promise()
    .then(data => true)
    .catch(err => {
      if (err.statusCode === 404) {
        return false;
      }
      throw err;
    });

const redirect = (to, status) => ({
  status,
  statusDescription: STATUS_CODES[status],
  headers: {
    location: [{ key: 'Location', value: to }],
  },
});

const rewrite = async (to, event) => {
  let { request } = event.Records[0].cf;

  const keyExists = await doesKeyExist(to);

  request.uri = to;
  return event;
};

module.exports = opts => ({
  before: redirectMiddleware.bind(null, opts),
  // onError: redirectMiddleware.bind(null, opts),
});

// const getResponse = async to => {
//   const isAbsoluteTo = /^(?:[a-z]+:)?\/\//.test(to);

//   const response = await (isAbsoluteTo
//     ? axios.get(to).then(data => ({
//         headers,
//         status,
//         statusText: statusDescription,
//         data: body,
//       }))
//     : S3.getObject({
//         Bucket: options.bucketName,
//         // remove leading slash
//         Key: to.replace(/^\/+/, ''),
//       })
//         .promise()
//         .then(data => {
//           console.log({ S3: data });
//         }));

//   console.log(response);

//   return response;
// };
