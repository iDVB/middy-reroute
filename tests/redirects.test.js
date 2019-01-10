const middy = require('middy');
const { cors } = require('middy/middlewares');
const redirects = require('../src/redirects');
const STATUS_CODES = require('http').STATUS_CODES;

const rulesSample = `
# https://www.netlify.com/docs/redirects/

/internal1  /internal2
/internal3  /internal4   301
/internal5  /internal6   302
/internal7  /internal8   303
/internal9 https://external.com

/trailingslash/  /trailingslash

/news   /blog   200

# Placeholders
/news/:year/:month/:date/:slug   /blog/:date/:month/:year/:slug
/articles/:year/:month/:date/:slug   /stories/:date/:month/:year/:slug  200
/things/:year/:month/:date/:slug   https://external.com/stuff/:date/:month/:year/:slug

# Splats
/shop/*  /checkout/:splat

# Custom 404
/ecommerce  /store-closed   404

# Existing URI
/existing/index.php  /nowork

# Existing URI FORCED
/something/index.html  /works  301!

# Proxy
/api/*  https://api.github.com/:splat   200

# Single Page App Catch-All
/*   /index.html   200

`;
const responseSample = (status, body) => ({
  status,
  statusDescription: STATUS_CODES[status],
  body,
});
const eventSample = (uri, response) => ({
  Records: [
    {
      cf: {
        request: {
          method: 'GET',
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
        response,
      },
    },
  ],
});
const redirectSample = (uri, status) => ({
  status,
  statusDescription: STATUS_CODES[status],
  headers: {
    location: [{ key: 'Location', value: uri }],
  },
});
const proxySample = {
  status: 200,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'x-ratelimit-limit': '60',
    'x-ratelimit-remaining': '53',
    'x-ratelimit-reset': '1547159078',
    'cache-control': 'public, max-age=60, s-maxage=60',
    etag: 'W/"dc3da1e9a5fad59509e13668ee78d493"',
    'last-modified': 'Mon, 07 Jan 2019 14:51:44 GMT',
    'x-github-media-type': 'github.v3',
  },
  statusDescription: 'OK',
  body: {
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
      'Director of Technology @KlickInc \r\nDev, DevOp, Automation Advocate\r\nInto: #docker #serverless #makingiteasy',
    public_repos: 43,
    public_gists: 21,
    followers: 14,
    following: 11,
    created_at: '2010-01-25T16:28:03Z',
    updated_at: '2019-01-07T14:51:44Z',
  },
};

const testScenerio = (rules, request, callback, done) => {
  const handler = middy((event, context, cb) => cb(null, event));
  handler.use(redirects({ rules }));
  handler(request, {}, (err, event) => {
    if (err) throw err;
    callback(event);
    done();
  });
};

describe('📦 Middleware Redirects', () => {
  test('Redirect should work', done => {
    testScenerio(
      rulesSample,
      eventSample('/internal1'),
      event => {
        expect(event).toEqual(redirectSample('/internal2', 301));
      },
      done,
    );
  });

  test('Redirect (Internal) with 301 should work', done => {
    testScenerio(
      rulesSample,
      eventSample('/internal3'),
      event => {
        expect(event).toEqual(redirectSample('/internal4', 301));
      },
      done,
    );
  });

  test('Redirect (Internal) with 302 should work', done => {
    testScenerio(
      rulesSample,
      eventSample('/internal5'),
      event => {
        expect(event).toEqual(redirectSample('/internal6', 302));
      },
      done,
    );
  });

  test('Redirect (Internal) with 303 should work', done => {
    testScenerio(
      rulesSample,
      eventSample('/internal7'),
      event => {
        expect(event).toEqual(redirectSample('/internal8', 303));
      },
      done,
    );
  });

  test('Redirect (External) should work', done => {
    testScenerio(
      rulesSample,
      eventSample('/internal9'),
      event => {
        expect(event).toEqual(redirectSample('https://external.com', 301));
      },
      done,
    );
  });

  test('Trailing slash normalization should work', done => {
    testScenerio(
      rulesSample,
      eventSample('/trailingslash'),
      event => {
        expect(event).toEqual(redirectSample('/trailingslash', 301));
      },
      done,
    );
  });

  test('Basic Rewrites should work', done => {
    testScenerio(
      rulesSample,
      eventSample('/news'),
      event => {
        expect(event).toEqual(eventSample('/blog'));
      },
      done,
    );
  });

  test('Placeholder (Internal) Redirects should work', done => {
    testScenerio(
      rulesSample,
      eventSample('/news/2004/02/12/my-story'),
      event => {
        expect(event).toEqual(redirectSample('/blog/12/02/2004/my-story', 301));
      },
      done,
    );
  });

  test('Placeholder (Internal) Rewrites should work', done => {
    testScenerio(
      rulesSample,
      eventSample('/articles/2004/02/12/my-story'),
      event => {
        expect(event).toEqual(eventSample('/stories/12/02/2004/my-story'));
      },
      done,
    );
  });

  test('Placeholder (External) Redirects should work', done => {
    testScenerio(
      rulesSample,
      eventSample('/things/2004/02/12/my-story'),
      event => {
        expect(event).toEqual(
          redirectSample('https://external.com/stuff/12/02/2004/my-story', 301),
        );
      },
      done,
    );
  });

  test('Splats (Internal) should work', done => {
    testScenerio(
      rulesSample,
      eventSample('/shop/2004/01/10/my-story'),
      event => {
        expect(event).toEqual(
          redirectSample('/checkout/2004/01/10/my-story', 301),
        );
      },
      done,
    );
  });

  test('Custom 404s should work', done => {
    testScenerio(
      rulesSample,
      eventSample('/ecommerce'),
      event => {
        expect(event).toEqual(eventSample('/store-closed'));
      },
      done,
    );
  });

  test('Existing URIs files should be ignored', done => {
    const inputEvent = eventSample('/existing/index.php', responseSample(200));
    testScenerio(
      rulesSample,
      inputEvent,
      event => {
        expect(event).toEqual(inputEvent);
      },
      done,
    );
  });

  test('Existing URIs files but forced should be handled', done => {
    testScenerio(
      rulesSample,
      eventSample('/something/index.html', 200),
      event => {
        expect(event).toEqual(redirectSample('/works', 301));
      },
      done,
    );
  });

  test('Proxying should work', done => {
    testScenerio(
      rulesSample,
      eventSample('/api/users/iDVB'),
      event => {
        expect(event).toEqual(eventSample('/api/users/iDVB', proxySample));
      },
      done,
    );
  });

  test('Catch-all should work', done => {
    testScenerio(
      rulesSample,
      eventSample('/somerandomlongthing'),
      event => {
        expect(event).toEqual(eventSample('/index.html'));
      },
      done,
    );
  });
});
