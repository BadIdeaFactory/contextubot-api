import debug from 'debug';

import fs from 'fs';
import { promisify } from 'util';

import uuidv4 from 'uuid/v4';
import mime from 'mime-types';
import Promise from 'promise';
import AWS from 'aws-sdk';
import tmp from 'tmp';
import request from 'requisition';

import express from 'express';
import logger from 'morgan';
import bodyParser from 'body-parser';

import self from '../package';

const log = debug('contextubot:api');

const readFile = promisify(fs.readFile);

AWS.config.update({
  accessKeyId: process.env.AWS_ID,
  secretAccessKey: process.env.AWS_SECRET,
});

const s3 = new AWS.S3();

const putObject = (params) => {
  return new Promise((fulfill, reject) => {
    s3.putObject(params, (err, res) => {
      if (err) reject(err);
      else fulfill(res);
    });
  });
};

const app = express();
tmp.setGracefulCleanup();

app.disable('x-powered-by');
app.use(logger('dev', {
  skip: () => app.get('env') === 'test'
}));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

app.get('/', (req, res) => {
  res.send([
    self.name, self.version
  ]);
});

app.post('/fingerprint', async (req, res) => {
  log(req.body);
  const { url } = req.body;
  res.send({ data: await processURL(url) });
});

const processURL = async (url) => {
  const id = uuidv4();
  const dir = tmp.dirSync();
  log(id, dir.name);

  // download
  const response = await request(url);
  log(response.headers);

  let contentType = 'application/octet-stream';
  if (response.headers['content-type']) contentType = response.headers['content-type'];

  const extension = mime.extension(contentType);
  await response.saveTo(`${dir.name}/${id}.${extension}`)

  // upload (s3)
  const data = await readFile(`${dir.name}/${id}.${extension}`);
  const result = await putObject({
    Body: data,
    ACL: 'public-read',
    ContentType: contentType,
    Bucket: 'ingest.contextubot.net', // TODO -> ENV
    Key: `test/${id}/${id}.${extension}`
  });
  log(result);

  // dir.removeCallback(); // FIXME ENOTEMPTY: directory not empty, rmdir

  // compute link
  log(`https://s3.amazonaws.com/fingerprints.contextubot.net/test/${id}/${id}.afpt`);
  return `https://s3.amazonaws.com/fingerprints.contextubot.net/test/${id}/${id}.afpt`;
}


// Catch 404 and forward to error handler
app.use((req, res, next) => {
  const err = new Error('Not Found');
  err.status = 404;
  next(err);
});

// Error handler
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  res
    .status(err.status || 500)
    .send({ error: [{ message: err.message }] });
});

export default app;
