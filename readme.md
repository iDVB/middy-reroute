<div align="center">
  <p><strong>middy-reroute is a <a href="https://github.com/middyjs/middy">MiddyJS</a> middleware (AWS Lambda) providing complex redirect, rewrite and proxying capabilities by simply placing a rules file into your S3 bucket.</strong></p>
</div>

<div align="center">
<p>
  <a href="http://badge.fury.io/js/middy-reroute">
    <img src="https://badge.fury.io/js/middy-reroute.svg" alt="npm version" style="max-width:100%;">
  </a>
  <a href="https://codecov.io/gh/iDVB/middy-reroute">
    <img src="https://codecov.io/gh/iDVB/middy-reroute/branch/master/graph/badge.svg" alt="codecov" style="max-width:100%;">
  </a>
  <a href="https://snyk.io/test/github/iDVB/middy-reroute?targetFile=package.json">
    <img src="https://snyk.io/test/github/iDVB/middy-reroute/badge.svg?targetFile=package.json" alt="Known Vulnerabilities" data-canonical-src="https://snyk.io/test/github/iDVB/middy-reroute?targetFile=package.json" style="max-width:100%;">
  </a>
  <a href="https://standardjs.com/">
    <img src="https://img.shields.io/badge/code_style-standard-brightgreen.svg" alt="Standard Code Style"  style="max-width:100%;">
  </a>
</p>
</div>


## TOC

 - [Install](#install)
 - [Why?](#why?)
 - [Requirements](#requirements)
 - [Usage](#usage)
 - [API](#API)
 - [Contributing](#contributing)
 - [License](#license)


## Why?

Serverless hosting of static websites presents a [few challenges](https://read.acloud.guru/6-things-i-wish-i-had-known-before-going-serverless-502236cf5540#84cf) when it comes to typical server http responses. What we really want as developers it to have the power of `.htaccess` or similar functions. This allowed you to create complex redirect and rewrite rules and simply by placing this file alongside your application files you'd be off to the races. 

So far, no cloud provider offers this ease of configuration without a bit of setup. In the case of AWS, you can use Lambda@Edge to intercept all incoming requests and to handle them as you like. middy-reroute aims to simplify that process by handling all the heavy lifting and offering you a familiar `_redirects` file with which to implement your desired redirects, rewrites, proxies, and custom 404s.

This functionality is modeled very closely after a [similar core feature of Netlify's hosting service](https://www.netlify.com/docs/redirects/).

## Install

As simple as:

```bash
npm install middy middy-reroute
```

## Requirements

- middy
- Node >= 8.10
- Lambda@Edge
  - Cloudfront -> Lambda -> S3
  - origin-request event

middy-reroute has been built to work by default from **Node >= 8.10**.
You will also need the core middyjs middleware engine.

While most of middy's middlewares have been written for use with AWS Lambda + API Gateway, middy-reroute work **exclusively** with [Lambda@Edge](https://docs.aws.amazon.com/lambda/latest/dg/lambda-edge.html). This is due to the fact that the middleware needs to run at the edge CDN so that it can intercept requests made to your origin (S3).

Not familiar with Lambda@Edge? No worries, it's easier then it sounds, and there are many great tutorials and courses. Full disclosure, I'm the author of [this course](https://acloud.guru/learn/lambda-edge).

## Usage

Using middy-reroute is pretty effortless but very powerful.

 1. Create your Lambda function similar to the handler.js below.
 2. Associate this function with the `origin-request` event of your CloudFront CDN that sits in front of your site's s3 bucket.
 3. Place your desired rules into a [_redirects](#_redirects-file) file and upload into the root of your S3 bucket.
 4. Profit!

Example:

```javascript
# handler.js

const middy = require('middy');
const reroute = require('middy-reroute');

// This is your typical handler. The only difference here is that you know that the event you get will already be manipulated by the middy-reroute middleware.
const finalHandler = (event, context, callback) => {
  // middy-reroute will always return three types of events
  // 1) full original event untouched
  // 2) full original event with the [uri] changed
  // 3) raw response which may be a redirect or a response that includes the body etc. Eg. Custom 404, proxied response etc.
  const request = !!event.Records ? event.Records[0].cf.request : event;

  // Unless you have additional operations, you would normally just return middy-reroute's event untouched.
  callback(null, request);
}

const handler = middy(finalHandler)
  .use(reroute());

module.exports = { handler };
```

## _redirects file

See [Netlify's docs](https://www.netlify.com/docs/redirects/) for more detailed information about options.

```markdown
# Redirect with 301
/home           /
/google         https://www.google.com

# Redirect with 302
/my-redirect    /             302

# Rewrite a path
/pass-through   /index.html   200
/*              /index.html   200

# Custom 404
/ecommerce      /closed       404

# Placeholders
/news/:year/:month/:date/:slug    /blog/:date/:month/:year/:slug

# Splats
/news/*   /blog/:splat

# Proxying
/api/*  https://api.example.com/:splat  200
```

## API

### options

```javascript
{
    // 'file' is the S3 key where your rules file can be found
    file: '_redirects',  // default

    // 'multiFile' is a boolean to denote if you would like middy-reroute to
    // look for host specific rules files or just a single rules file matching
    // the *options.file* param above. MultiFiles will resolve to 
    // `${options.file}_${host}`
    // Eg. multiFile: true (and the host is domain.com)
    //     _redirects_domain.com
    multiFile: true,  // default

    // 'rulesBucket' is the bucket to reference when looking for the rules files
    // Default: As a default the origin bucket is used.
    rulesBucket: 'my-existing-bucket-name',

    // 'regex'
    regex: {
      // 'htmlEnd' is used to identify URI that end in an html file.
      // These will be rewriten if *options.friendlyUrls*: true.
      htmlEnd: /(.*)\/((.*)\.html?)$/,  // default

      // 'ignoreRules' is used to identify lines in the rules file that should
      // be completely ignored.
      // Default: Ignores comments and empty lines.
      ignoreRules: /^(?:#.*[\r\n]|\s*[\r\n])/gm,  // default

      // 'ruleline' is used to parse each individual line of rules in the rules
      // file. Change this at your own discretion. At the very lease the same 
      // number and order of match groups needs to be defined.
      ruleline: /([^\s\r\n]+)(?:\s+)([^\s\r\n]+)(?:\s+(\d+)([!]?))?/,  // default
    },

    // 'defaultStatus' - specifies the default http status to use when none is
    // specified in the rule.
    defaultStatus: 301,  // default

    // 'redirectStatuses' declares which http statuses should result in
    // redirects.
    redirectStatuses: [301, 302, 303],  // default

    // 'friendlyUrls' specifies whether the URIs should be redirected 
    // to avoid ending in .html
    // Eg. 
    //   /thing/index.html  =  /thing/
    //   /thing/about.html  =  /thing/about/
    friendlyUrls: true,  // default

    // 'defaultDoc' is the name of the file that should be served up when
    // paths are referenced.
    // Eg. /thing  will be rewriten to /thing/index.html
    // note* Since it's a rewrite the user will still see this as /thing
    defaultDoc: `index.html`,  // default

    // 'custom404' is the S3 key where to automatically look for your custom
    //  404 page when a resource can't be found.
    custom404: `404.html`,  // default
  };
```

## Contributing

Everyone is very welcome to contribute to this repository. Feel free to [raise issues](https://github.com/iDVB/middy-reroute/issues) or to [submit Pull Requests](https://github.com/iDVB/middy-reroute/pulls).


## License

Licensed under [MIT License](LICENSE).
