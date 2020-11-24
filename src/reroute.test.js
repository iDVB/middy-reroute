import fs from 'fs';
import path from 'path';
import middy from 'middy';
import AWS from 'aws-sdk';
import axios from 'axios';
import { reroute } from '.';
import _reduce from 'lodash.reduce';
import merge from './utils/deepmerge';
import {
  eventResponse,
  redirectResponse,
  customResponse,
  axiosResponse,
  proxyResponse,
} from './tests/responses';

const rules = fs
  .readFileSync(path.join(__dirname, './tests/_redirects'))
  .toString();
const rulesDomain = fs
  .readFileSync(
    path.join(__dirname, './tests/_redirects_reroute.danvanbrunt.com'),
  )
  .toString();
const html404 = fs
  .readFileSync(path.join(__dirname, './tests/404.html'))
  .toString();

const mockS3GetObject = jest.fn();
const mockS3HeadObject = jest.fn();
jest.mock('aws-sdk', () => {
  return {
    S3: jest.fn(() => ({
      getObject: mockS3GetObject,
      headObject: mockS3HeadObject,
    })),
  };
});
jest.mock('axios');

describe('📦  Reroute Middleware', () => {
  beforeEach(() => {
    mockS3GetObject.mockReset();
    mockS3GetObject.mockClear();
    mockS3HeadObject.mockReset();
    mockS3HeadObject.mockClear();
    axios.mockReset();
    axios.mockClear();
  });

  const testReroute = ({
    event,
    testOptions: testOpt = {},
    midOptions: midOpt = {},
  }) => {
    const testOptions = merge(
      {
        noFiles: [`nofilehere/index.html`, `pretty/things.html`],
        fileContents: { _redirects: rules, '404.html': html404 },
      },
      testOpt,
    );
    const midOptions = merge(
      {
        cacheTtl: 0,
      },
      midOpt,
    );
    return new Promise((resolve, reject) => {
      mockS3HeadObject.mockImplementation(({ Key }) => ({
        promise: () =>
          testOptions.noFiles.includes(Key)
            ? Promise.reject({ errorType: 'NoSuchKey' })
            : Promise.resolve({ statusCode: 200 }),
      }));
      mockS3GetObject.mockImplementation(({ Key }) => ({
        promise: () =>
          testOptions.noFiles.includes(Key)
            ? Promise.reject({ errorType: 'NoSuchKey' })
            : Promise.resolve({ Body: testOptions.fileContents[Key] }),
      }));

      const handler = middy((event, context, cb) => cb(null, event));
      handler.use(reroute(midOptions));
      handler(event, {}, (err, event) => {
        if (err) reject(err);
        resolve(event);
      });
    });
  };

  describe('Settings and Files', () => {
    it('No _redirects file, no files should pass-through', async () => {
      const event = await testReroute({
        event: eventResponse({ uri: '/asdf' }),
        testOptions: {
          noFiles: ['asdf', 'asdf/index.html', '404.html', '_redirects'],
        },
      });
      expect(event).toEqual(eventResponse({ uri: '/asdf/index.html' }));
    });

    it('No DefaultDoc should pass-through', async () => {
      const event = await testReroute({
        event: eventResponse({ uri: '/asdf' }),
        midOptions: {
          defaultDoc: null,
        },
      });
      expect(event).toEqual(eventResponse({ uri: '/asdf' }));
    });

    it('No FriendlyURLs should pass-through', async () => {
      const event = await testReroute({
        event: eventResponse({ uri: '/asdf/index.html' }),
        midOptions: {
          friendlyUrls: false,
        },
      });
      expect(event).toEqual(eventResponse({ uri: '/asdf/index.html' }));
    });

    it('Root route should work', async () => {
      const event = await testReroute({ event: eventResponse({ uri: '/' }) });
      expect(event).toEqual(eventResponse({ uri: '/index.html' }));
    });
  });

  describe('URL Normalization', () => {
    it('PrettyURLs should work', async () => {
      const event = await testReroute({
        event: eventResponse({ uri: '/pretty/things.html' }),
      });
      expect(event).toEqual(redirectResponse('/pretty/things/', 301));
    });

    it('Index PrettyURLs should work', async () => {
      const event = await testReroute({
        event: eventResponse({ uri: '/pretty/index.html' }),
      });
      expect(event).toEqual(redirectResponse('/pretty/', 301));
    });

    it('PrettyURLs should be ignored for existing files', async () => {
      const inputEvent = eventResponse({ uri: '/something/about.html' });
      const event = await testReroute({ event: inputEvent });
      expect(event).toEqual(inputEvent);
    });

    it('Trailing slash normalization should work', async () => {
      const event = await testReroute({
        event: eventResponse({ uri: '/trailingslash' }),
      });
      expect(event).toEqual(redirectResponse('/trailred', 301));
    });

    it('DefaultDoc with pass-throughs should work', async () => {
      const event = await testReroute({
        event: eventResponse({ uri: '/asdfdsfsd/' }),
      });
      expect(event).toEqual(eventResponse({ uri: '/asdfdsfsd/index.html' }));
    });
  });

  describe('Redirects', () => {
    it('Basics should work', async () => {
      const event = await testReroute({
        event: eventResponse({ uri: '/internal1' }),
      });
      expect(event).toEqual(redirectResponse('/internal2', 301));
    });

    it('Internal with 301 should work', async () => {
      const event = await testReroute({
        event: eventResponse({ uri: '/internal3' }),
      });
      expect(event).toEqual(redirectResponse('/internal4', 301));
    });

    it('Internal with 302 should work', async () => {
      const event = await testReroute({
        event: eventResponse({ uri: '/internal5' }),
      });
      expect(event).toEqual(redirectResponse('/internal6', 302));
    });

    it('Internal with 303 should work', async () => {
      const event = await testReroute({
        event: eventResponse({ uri: '/internal7' }),
      });
      expect(event).toEqual(redirectResponse('/internal8', 303));
    });

    it('External should work', async () => {
      const event = await testReroute({
        event: eventResponse({ uri: '/internal9' }),
      });
      expect(event).toEqual(redirectResponse('https://external.com', 301));
    });

    it('Deep redirects should work', async () => {
      const host = 'domain.com';
      const rules = `
      https://domain.com/*      https://www.domain.com/:splat
      `;
      const event = await testReroute({
        event: eventResponse({
          uri: '/deep/stuff',
          headers: { host },
        }),
        midOptions: { rules },
      });
      expect(event).toEqual(
        redirectResponse('https://www.domain.com/deep/stuff', 301),
      );

      const event2 = await testReroute({
        event: eventResponse({
          uri: '/',
          headers: { host },
        }),
        midOptions: { rules },
      });
      expect(event2).toEqual(redirectResponse('https://www.domain.com/', 301));
    });
  });

  describe('Rewrites', () => {
    it('Basic Rewrites should work', async () => {
      const event = await testReroute({
        event: eventResponse({ uri: '/news/' }),
      });
      expect(event).toEqual(eventResponse({ uri: '/blog/index.html' }));
    });

    it('Rewrites w/o file should custom 404', async () => {
      const event = await testReroute({
        event: eventResponse({ uri: '/stuff/' }),
      });
      expect(event).toEqual(customResponse(html404));
    });

    it('Rewrites w/o file OR custom 404 should pass-through', async () => {
      const event = await testReroute({
        event: eventResponse({ uri: '/stuff/' }),
        testOptions: {
          noFiles: ['nofilehere/index.html', '404.html'],
        },
      });
      expect(event).toEqual(eventResponse({ uri: '/nofilehere/index.html' }));
    });
  });

  describe('Proxying', () => {
    it('Basic should work', async () => {
      axios.mockImplementation(() => Promise.resolve(axiosResponse));
      const event = await testReroute({
        event: eventResponse({ uri: '/api/users/iDVB' }),
      });
      expect(event).toEqual(proxyResponse);
    });
  });

  describe('Placeholders & Splats', () => {
    it('Placeholder (Internal) Redirects should work', async () => {
      const event = await testReroute({
        event: eventResponse({ uri: '/news/2004/02/12/my-story' }),
      });
      expect(event).toEqual(redirectResponse('/blog/12/02/2004/my-story', 301));
    });

    it('Placeholder (Internal) Rewrites should work', async () => {
      const event = await testReroute({
        event: eventResponse({ uri: '/articles/2004/02/12/my-story' }),
      });
      expect(event).toEqual(
        eventResponse({ uri: '/stories/12/02/2004/my-story/index.html' }),
      );
    });

    it('Placeholder (External) Redirects should work', async () => {
      const event = await testReroute({
        event: eventResponse({ uri: '/things/2004/02/12/my-story' }),
      });
      expect(event).toEqual(
        redirectResponse('https://external.com/stuff/12/02/2004/my-story', 301),
      );
    });

    it('Splats (Internal) should work', async () => {
      const event = await testReroute({
        event: eventResponse({ uri: '/shop/2004/01/10/my-story' }),
      });
      expect(event).toEqual(
        redirectResponse('/checkout/2004/01/10/my-story', 301),
      );
    });
  });

  describe('Host Domains', () => {
    it('FROM rule should work', async () => {
      axios.mockImplementation(() => Promise.resolve(axiosResponse));
      const host = 'reroute.danvanbrunt.com';
      const event = await testReroute({
        event: eventResponse({ uri: '/hosttest', headers: { host } }),
        testOptions: {
          fileContents: { [`_redirects_${host}`]: rulesDomain },
        },
        midOptions: { multiFile: true },
      });
      expect(event).toEqual(redirectResponse('https://thestar.com', 301));
    });

    it('FROM with no rule should pass-through', async () => {
      axios.mockImplementation(() => Promise.resolve(axiosResponse));
      const host = 'red.danvanbrunt.com';
      const event = await testReroute({
        event: eventResponse({ uri: '/hosttest', headers: { host } }),
        testOptions: {
          noFiles: [`_redirects_${host}`],
        },
        midOptions: { multiFile: true },
      });
      expect(event).toEqual(eventResponse({ uri: '/hosttest/index.html' }));
    });

    it('Absolute FROM should work', async () => {
      const host1 = 'red.danvanbrunt.com';
      const host2 = 'blue.danvanbrunt.com';
      const rules = `
        https://${host1}/local  https://twitter.com   302!
        /local  https://www.cnn.com   302!
      `;

      const matchEvent = await testReroute({
        event: eventResponse({ uri: '/local', headers: { host: host1 } }),
        midOptions: { rules },
      });
      expect(matchEvent).toEqual(redirectResponse('https://twitter.com', 302));

      const unMatchEvent = await testReroute({
        event: eventResponse({ uri: '/local', headers: { host: host2 } }),
        midOptions: { rules },
      });
      expect(unMatchEvent).toEqual(
        redirectResponse('https://www.cnn.com', 302),
      );
    });
  });

  describe('Custom 404s', () => {
    it('When missing should pass-through', async () => {
      const event = await testReroute({
        event: eventResponse({ uri: '/ecommerce' }),
        testOptions: {
          noFiles: ['store-closed/index.html', '404.html'],
        },
      });
      expect(event).toEqual(eventResponse({ uri: '/store-closed/index.html' }));
    });
  });

  describe('Condition: Language', () => {
    it('Basic Language match should work', async () => {
      const rules = `/langtest  /match   302!  Language=en,fr`;
      const matchEvent = await testReroute({
        event: eventResponse({
          uri: '/langtest',
          headers: {
            'accept-language': 'en-GB,en-US;q=0.9,fr-CA;q=0.7,en;q=0.8',
          },
        }),
        midOptions: { rules },
      });
      expect(matchEvent).toEqual(redirectResponse('/match', 302));

      const unMatchEvent = await testReroute({
        event: eventResponse({ uri: '/langtest' }),
        midOptions: { rules },
      });
      expect(unMatchEvent).toEqual(
        eventResponse({ uri: '/langtest/index.html' }),
      );
    });
  });

  describe('Condition: Country', () => {
    it('Basic Country should work', async () => {
      const rules = `
      /   /index.html   200!   Country=fR
      /   /wishyouwerehere/index.html   200!
      `;
      const matchEvent = await testReroute({
        event: eventResponse({
          uri: '/',
          headers: { 'cloudfront-viewer-country': 'Fr' },
        }),
        midOptions: { rules },
      });
      expect(matchEvent).toEqual(
        eventResponse({
          uri: '/index.html',
          headers: { 'cloudfront-viewer-country': 'Fr' },
        }),
      );

      const unMatchEvent = await testReroute({
        event: eventResponse({ uri: '/' }),
        headers: { 'cloudfront-viewer-country': 'CA' },
        midOptions: { rules },
      });
      expect(unMatchEvent).toEqual(
        eventResponse({ uri: '/wishyouwerehere/index.html' }),
      );
    });
  });

  describe('Condition: UserAgent', () => {
    it('Basic UserAgent should work', async () => {
      const rules = `
      /*      /upgrade-browser   200    UserAgent=IE:<=11
      `;
      const matchEvent = await testReroute({
        event: eventResponse({
          uri: '/match',
          headers: {
            'user-agent':
              'Mozilla/5.0 (Windows NT 10.0; Trident/7.0; rv:11.0) like Gecko',
          },
        }),
        midOptions: { rules },
      });
      expect(matchEvent).toEqual(
        eventResponse({
          uri: '/upgrade-browser/index.html',
          headers: {
            'user-agent':
              'Mozilla/5.0 (Windows NT 10.0; Trident/7.0; rv:11.0) like Gecko',
          },
        }),
      );

      const unMatchEvent = await testReroute({
        event: eventResponse({
          uri: '/unmatch',
          headers: {
            'user-agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/87.0.4280.66 Safari/537.36',
          },
        }),
        midOptions: { rules },
      });
      expect(unMatchEvent).toEqual(
        eventResponse({
          uri: '/unmatch/index.html',
          headers: {
            'user-agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/87.0.4280.66 Safari/537.36',
          },
        }),
      );
    });

    it('Multiple UserAgent Rules should work', async () => {
      const rules = `
      /*      /upgrade-browser   200    UserAgent=IE:<=11,Chrome:>89
      `;

      // Match on IE
      const ieAgent =
        'Mozilla/5.0 (Windows NT 10.0; Trident/7.0; rv:11.0) like Gecko';
      const matchIE = await testReroute({
        event: eventResponse({
          uri: '/match',
          headers: { 'user-agent': ieAgent },
        }),
        midOptions: { rules },
      });
      expect(matchIE).toEqual(
        eventResponse({
          uri: '/upgrade-browser/index.html',
          headers: { 'user-agent': ieAgent },
        }),
      );

      // Match on Chrome
      const chromeAgent1 =
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4280.66 Safari/537.36';
      const matchChrome = await testReroute({
        event: eventResponse({
          uri: '/match',
          headers: { 'user-agent': chromeAgent1 },
        }),
        midOptions: { rules },
      });
      expect(matchChrome).toEqual(
        eventResponse({
          uri: '/upgrade-browser/index.html',
          headers: { 'user-agent': chromeAgent1 },
        }),
      );

      // unMatch on Chrome
      const chromeAgent2 =
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/89.0.4280.66 Safari/537.36';
      const unMatchChrome = await testReroute({
        event: eventResponse({
          uri: '/unmatch',
          headers: { 'user-agent': chromeAgent2 },
        }),
        midOptions: { rules },
      });
      expect(unMatchChrome).toEqual(
        eventResponse({
          uri: '/unmatch/index.html',
          headers: { 'user-agent': chromeAgent2 },
        }),
      );
    });

    it('Catch-All UserAgent Rules should work', async () => {
      const rules = `
      /*      /upgrade-browser   200!    UserAgent=IE:*
      `;

      // Match on IE
      const ieAgent =
        'Mozilla/5.0 (Windows NT 10.0; Trident/7.0; rv:11.0) like Gecko';
      const matchIE = await testReroute({
        event: eventResponse({
          uri: '/match',
          headers: { 'user-agent': ieAgent },
        }),
        midOptions: { rules },
      });
      expect(matchIE).toEqual(
        eventResponse({
          uri: '/upgrade-browser/index.html',
          headers: { 'user-agent': ieAgent },
        }),
      );

      // unMatch on Chrome
      const chromeAgent =
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/89.0.4280.66 Safari/537.36';
      const unMatchChrome = await testReroute({
        event: eventResponse({
          uri: '/unmatch',
          headers: { 'user-agent': chromeAgent },
        }),
        midOptions: { rules },
      });
      expect(unMatchChrome).toEqual(
        eventResponse({
          uri: '/unmatch/index.html',
          headers: { 'user-agent': chromeAgent },
        }),
      );
    });
  });

  describe('Caching', () => {
    it('RulesGet should cache', async () => {
      expect.assertions(2);
      const midOptions = { cacheTtl: 1 };
      await testReroute({
        event: eventResponse({
          uri: '/test1',
          domainName: 'd1bucket.s3.amazonaws.com',
          headers: { host: 'd1.com' },
        }),
        midOptions,
      });
      await testReroute({
        event: eventResponse({
          uri: '/test2',
          domainName: 'd1bucket.s3.amazonaws.com',
          headers: { host: 'd1.com' },
        }),
        midOptions,
      });
      await testReroute({
        event: eventResponse({
          uri: '/test3',
          domainName: 'd2bucket.s3.amazonaws.com',
          headers: { host: 'd2.com' },
        }),
        midOptions,
      });
      expect(mockS3GetObject).toBeCalledWith(
        expect.objectContaining({
          Key: '_redirects',
        }),
      );
      expect(mockS3GetObject).toHaveBeenCalledTimes(2);
    });

    it('RulesGet cache should have TTF', async () => {
      expect.assertions(1);
      const midOptions = { cacheTtl: 0 };
      await testReroute({
        event: eventResponse({ uri: '/test1' }),
        midOptions,
      });
      await testReroute({
        event: eventResponse({ uri: '/test2' }),
        midOptions,
      });
      expectNCallsWithArgs(mockS3GetObject.mock.calls, 2, [
        expect.objectContaining({
          Key: '_redirects',
        }),
      ]);
    });
  });
});

const expectNCallsWithArgs = (received, numCalls, expected) => {
  const calls = [...Array(numCalls)].map(() => expected);
  return expect(received).toEqual(calls);
};
