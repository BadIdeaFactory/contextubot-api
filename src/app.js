import debug from 'debug';

import fs from 'fs';
import { promisify } from 'util';

import uuidv4 from 'uuid/v4';
import mime from 'mime-types';
import tmp from 'tmp';
import request from 'requisition';

import express from 'express';
import logger from 'morgan';
import bodyParser from 'body-parser';

import ffprobe from 'ffprobe';
import ffprobeStatic from 'ffprobe-static';
import embedly from 'embedly';
import youtubedl from 'youtube-dl';

import { putObject } from './aws';
import self from '../package';

const log = debug('contextubot:api');

const readFile = promisify(fs.readFile);

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

// get headers
app.get('/headers', async (req, res) => {
  log(req.body);
  const { url } = req.query;

  const response = await request['head'](url);
  log(response.headers);
  res.send({ data: response.headers });
});

// if html -> oembed?
app.get('/embed', (req, res) => {
  log(req.body);
  const { url } = req.query;

  const api = new embedly({ key: process.env.EMBEDLY_KEY });
  api.oembed({ url }, (err, objs) => {
    if (err) console.log(err); // FIXME
    res.send({ data: objs });
  });
});

// is it media?
app.get('/ffprobe', async (req, res) => {
  log(req.body);
  const { url } = req.query;

  const info = await ffprobe(url, { path: ffprobeStatic.path });
  res.send({ data: info });
});

// media info // WE NEED TO RENAME THINGS AROUND HERE
app.get('/info', async (req, res) => {
  log(req.body);
  const { url } = req.query;

  youtubedl.getInfo(url, [], (err, info) => {
    if (err) console.log(err); // FIXME
    res.send({ data: info });
  });
});

// extract media
// app.post('/extract', async (req, res) => {
//
// });

// fingerprint media
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
  const link = `https://s3.amazonaws.com/fingerprints.contextubot.net/test/${id}/${id}.afpt`;
  log(link);
  return link;
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
