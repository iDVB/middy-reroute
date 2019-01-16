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
      htmlEnd: /(.*)\/((.*)\.html?)$/,
      ignoreRules: /^(?:#.*[\r\n]|\s*[\r\n])/gm,
      ruleline: /([^\s\r\n]+)(?:\s+)([^\s\r\n]+)(?:\s+(\d+)([!]?))?/,
    },
    defaultStatus: 301,
    redirectStatuses: [301, 302, 303],
    bucketName: origin.s3.domainName.replace('.s3.amazonaws.com', ''),
    friendlyUrls: true,
    defaultDoc: `index.html`,
  };
  options = { ...defaults, ...opts };

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
      event = redirect(`${fullpath}/${end}`, 301);
    } else {
      // Gather and parse rules
      const data = await getRedirectData();
      // Find URI match in the rules
      match = findMatch(data, request.uri);
      if (match) {
        // Match: match found
        // Use status to decide how to handle
        event = isRedirectURI(match.status)
          ? redirect(match.parsedTo, match.status)
          : await rewrite(ensureDefaultDoc(match.parsedTo), handler.event);
      } else {
        // Pass-Through: No match, so other then DefaultDoc, let it pass through
        event = !isFile
          ? await rewrite(ensureDefaultDoc(request.uri), handler.event)
          : handler.event;
      }
    }

    handler.event = event;
  } catch (err) {
    handler.callback(null, err);
  }

  return next();
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
    ? parseRules(options.rules)
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

  request.uri = to;
  return event;
};

module.exports = opts => ({
  before: redirectMiddleware.bind(null, opts),
  // onError: redirectMiddleware.bind(null, opts),
});

const ensureDefaultDoc = uri =>
  path.extname(uri) === '' ? path.join(uri, options.defaultDoc) : uri;

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
