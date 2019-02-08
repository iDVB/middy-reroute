import _reduce from 'lodash.reduce';
import { STATUS_CODES } from 'http';
import merge from '../utils/deepmerge';

const eventResponse = ({ uri, headers: headerParams }, override = {}) => {
  const headers = merge(
    {
      'user-agent': [
        {
          key: 'User-Agent',
          value: 'Amazon CloudFront',
        },
      ],
      via: [
        {
          key: 'Via',
          value:
            '1.1 435df4a736dacde836367e67036d6c56.cloudfront.net (CloudFront)',
        },
      ],
      host: [
        {
          key: 'Host',
          value: 'layer-redirects-dev-defaultbucket-1hr6azp5liexa',
        },
      ],
      'accept-encoding': [
        {
          key: 'Accept-Encoding',
          value: 'gzip',
        },
      ],
      'upgrade-insecure-requests': [
        {
          key: 'upgrade-insecure-requests',
          value: '1',
        },
      ],
      'x-forwarded-for': [
        {
          key: 'X-Forwarded-For',
          value: '38.99.136.178',
        },
      ],
    },
    toKeyValueHeaders(headerParams),
  );

  return merge(
    {
      Records: [
        {
          cf: {
            request: {
              method: 'GET',
              headers,
              origin: {
                s3: {
                  authMethod: 'origin-access-identity',
                  customHeaders: {},
                  domainName: 'layer-redirects-dev-defaultbucket-1hr6azp5liexa',
                  path: '',
                  region: 'us-east-1',
                },
              },
              querystring: '',
              uri,
            },
          },
        },
      ],
    },
    override,
  );
};
const redirectResponse = (uri, status) => ({
  status,
  statusDescription: STATUS_CODES[status],
  headers: {
    location: [{ key: 'Location', value: uri }],
  },
});
const customResponse = body => ({
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
  body: body,
});
const axiosResponse = {
  status: 200,
  statusText: 'OK',
  headers: {
    server: 'GitHub.com',
    date: 'Wed, 23 Jan 2019 17:35:22 GMT',
    'content-type': 'application/json; charset=utf-8',
    'transfer-encoding': 'chunked',
    connection: 'close',
    status: '200 OK',
    'x-ratelimit-limit': '60',
    'x-ratelimit-remaining': '59',
    'x-ratelimit-reset': '1548268522',
    'cache-control': 'public, max-age=60, s-maxage=60',
    vary: 'Accept',
    etag: 'W/"99366084be4e93df287625dbcec41419"',
    'last-modified': 'Thu, 17 Jan 2019 14:08:46 GMT',
    'x-github-media-type': 'github.v3',
    'access-control-expose-headers':
      'ETag, Link, Location, Retry-After, X-GitHub-OTP, X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset, X-OAuth-Scopes, X-Accepted-OAuth-Scopes, X-Poll-Interval, X-GitHub-Media-Type',
    'access-control-allow-origin': '*',
    'strict-transport-security': 'max-age=31536000; includeSubdomains; preload',
    'x-frame-options': 'deny',
    'x-content-type-options': 'nosniff',
    'x-xss-protection': '1; mode=block',
    'referrer-policy':
      'origin-when-cross-origin, strict-origin-when-cross-origin',
    'content-security-policy': "default-src 'none'",
    'x-github-request-id': 'FE44:4BC6:2FD45F5:630C738:5C48A5DA',
  },
  data: {
    login: 'iDVB',
    id: 189506,
    node_id: 'MDQ6VXNlcjE4OTUwNg==',
    avatar_url: 'https://avatars1.githubusercontent.com/u/189506?v=4',
    gravatar_id: '',
    url: 'https://api.github.com/users/iDVB',
    html_url: 'https://github.com/iDVB',
    followers_url: 'https://api.github.com/users/iDVB/followers',
    following_url: 'https://api.github.com/users/iDVB/following{/other_user}',
    gists_url: 'https://api.github.com/users/iDVB/gists{/gist_id}',
    starred_url: 'https://api.github.com/users/iDVB/starred{/owner}{/repo}',
    subscriptions_url: 'https://api.github.com/users/iDVB/subscriptions',
    organizations_url: 'https://api.github.com/users/iDVB/orgs',
    repos_url: 'https://api.github.com/users/iDVB/repos',
    events_url: 'https://api.github.com/users/iDVB/events{/privacy}',
    received_events_url: 'https://api.github.com/users/iDVB/received_events',
    type: 'User',
    site_admin: false,
    name: 'Dan Van Brunt',
    company: '@KlickInc @KatalystAdvantage ',
    blog: '',
    location: 'Toronto, ON',
    email: null,
    hireable: null,
    bio:
      'Director of Technology @KlickInc \r\nDev, DevOp, Automation Advocate\r\nInto: #docker #serverless#makingiteasy',
    public_repos: 43,
    public_gists: 21,
    followers: 14,
    following: 11,
    created_at: '2010-01-25T16:28:03Z',
    updated_at: '2019-01-17T14:08:46Z',
  },
};
const proxyResponse = {
  body: `{"login":"iDVB","id":189506,"node_id":"MDQ6VXNlcjE4OTUwNg==","avatar_url":"https://avatars1.githubusercontent.com/u/189506?v=4","gravatar_id":"","url":"https://api.github.com/users/iDVB","html_url":"https://github.com/iDVB","followers_url":"https://api.github.com/users/iDVB/followers","following_url":"https://api.github.com/users/iDVB/following{/other_user}","gists_url":"https://api.github.com/users/iDVB/gists{/gist_id}","starred_url":"https://api.github.com/users/iDVB/starred{/owner}{/repo}","subscriptions_url":"https://api.github.com/users/iDVB/subscriptions","organizations_url":"https://api.github.com/users/iDVB/orgs","repos_url":"https://api.github.com/users/iDVB/repos","events_url":"https://api.github.com/users/iDVB/events{/privacy}","received_events_url":"https://api.github.com/users/iDVB/received_events","type":"User","site_admin":false,"name":"Dan Van Brunt","company":"@KlickInc @KatalystAdvantage ","blog":"","location":"Toronto, ON","email":null,"hireable":null,"bio":"Director of Technology @KlickInc \\r\\nDev, DevOp, Automation Advocate\\r\\nInto: #docker #serverless#makingiteasy","public_repos":43,"public_gists":21,"followers":14,"following":11,"created_at":"2010-01-25T16:28:03Z","updated_at":"2019-01-17T14:08:46Z"}`,
  headers: {
    'access-control-allow-origin': [
      {
        key: 'Access-Control-Allow-Origin',
        value: '*',
      },
    ],
    'access-control-expose-headers': [
      {
        key: 'Access-Control-Expose-Headers',
        value:
          'ETag, Link, Location, Retry-After, X-GitHub-OTP, X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset, X-OAuth-Scopes, X-Accepted-OAuth-Scopes, X-Poll-Interval, X-GitHub-Media-Type',
      },
    ],
    'cache-control': [
      {
        key: 'Cache-Control',
        value: 'public, max-age=60, s-maxage=60',
      },
    ],
    'content-security-policy': [
      {
        key: 'Content-Security-Policy',
        value: "default-src 'none'",
      },
    ],
    'content-type': [
      {
        key: 'Content-Type',
        value: 'application/json; charset=utf-8',
      },
    ],
    date: [
      {
        key: 'Date',
        value: 'Wed, 23 Jan 2019 17:35:22 GMT',
      },
    ],
    etag: [
      {
        key: 'Etag',
        value: 'W/"99366084be4e93df287625dbcec41419"',
      },
    ],
    'last-modified': [
      {
        key: 'Last-Modified',
        value: 'Thu, 17 Jan 2019 14:08:46 GMT',
      },
    ],
    'referrer-policy': [
      {
        key: 'Referrer-Policy',
        value: 'origin-when-cross-origin, strict-origin-when-cross-origin',
      },
    ],
    server: [
      {
        key: 'Server',
        value: 'GitHub.com',
      },
    ],
    status: [
      {
        key: 'Status',
        value: '200 OK',
      },
    ],
    'strict-transport-security': [
      {
        key: 'Strict-Transport-Security',
        value: 'max-age=31536000; includeSubdomains; preload',
      },
    ],
    vary: [
      {
        key: 'Vary',
        value: 'Accept',
      },
    ],
    'x-content-type-options': [
      {
        key: 'X-Content-Type-Options',
        value: 'nosniff',
      },
    ],
    'x-frame-options': [
      {
        key: 'X-Frame-Options',
        value: 'deny',
      },
    ],
    'x-github-media-type': [
      {
        key: 'X-Github-Media-Type',
        value: 'github.v3',
      },
    ],
    'x-github-request-id': [
      {
        key: 'X-Github-Request-Id',
        value: 'FE44:4BC6:2FD45F5:630C738:5C48A5DA',
      },
    ],
    'x-ratelimit-limit': [
      {
        key: 'X-Ratelimit-Limit',
        value: '60',
      },
    ],
    'x-ratelimit-remaining': [
      {
        key: 'X-Ratelimit-Remaining',
        value: '59',
      },
    ],
    'x-ratelimit-reset': [
      {
        key: 'X-Ratelimit-Reset',
        value: '1548268522',
      },
    ],
    'x-xss-protection': [
      {
        key: 'X-Xss-Protection',
        value: '1; mode=block',
      },
    ],
  },
  status: 200,
  statusDescription: 'OK',
};

//////////////////////
// Utils            //
//////////////////////
const headerMap = {
  'cloudfront-viewer-country': 'CloudFront-Viewer-Country',
};
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const capitalizeParam = param =>
  param
    .split('-')
    .map(i => i.charAt(0).toUpperCase() + i.slice(1))
    .join('-');
const toKeyValue = (key, value) =>
  !!value
    ? {
        [key]: [{ key: headerMap[key] || capitalizeParam(key), value }],
      }
    : {};

const toKeyValueHeaders = headers =>
  _reduce(
    headers,
    (results, value, key) => ({
      ...results,
      ...toKeyValue(key, value),
    }),
    {},
  );

export {
  eventResponse,
  redirectResponse,
  customResponse,
  axiosResponse,
  proxyResponse,
};
