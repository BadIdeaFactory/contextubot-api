// arn:aws:lambda:us-east-1:223945844886:function:EventRelay
'use strict';

const https = require('https');


exports.handler = (event, context, callback) => {
    const req = https.request({
    hostname: 'api.contextubot.net',
    port: 443,
    path: '/event',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    }
  }, (res) => {
    let body = '';
    console.log('Status:', res.statusCode); // eslint-disable-line no-console
    console.log('Headers:', JSON.stringify(res.headers)); // eslint-disable-line no-console
    res.setEncoding('utf8');
    res.on('data', (chunk) => body += chunk);
    res.on('end', () => {
    console.log('Successfully processed HTTPS response'); // eslint-disable-line no-console
    // If we know it's JSON, parse it
    if (res.headers['content-type'] === 'application/json') {
      body = JSON.parse(body);
    }
    callback(null, body);
    });
  });

  req.on('error', callback);
  req.write(JSON.stringify(event));
  req.end();
};
