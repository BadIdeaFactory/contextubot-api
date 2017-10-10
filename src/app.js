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
import cors from 'cors';

import PythonShell from 'python-shell';
import ffprobe from 'ffprobe';
import ffprobeStatic from 'ffprobe-static';
import embedly from 'embedly';
import youtubedl from 'youtube-dl';

import { putObject } from './aws';
import self from '../package';

const log = debug('contextubot:api');

const readFile = promisify(fs.readFile);
const python = promisify(PythonShell.run);

const app = express();
tmp.setGracefulCleanup();

app.disable('x-powered-by');
app.use(logger('dev', {
  skip: () => app.get('env') === 'test'
}));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

app.use(cors());
app.options('*', cors());

app.get('/', async (req, res) => {
  log(req.body);
  const { url } = req.query;

  const data = await inspectURL(url);
  // const data = await processURL(url);

  data[self.name] = self.version;
  res.send(data);
});

app.post('/', async (req, res) => {
  log(req.body);
  const { url } = req.query;

  const data = await processURL(url);

  res.send(data);
});

const inspectURL = async url => {
  if (!url) return {};
  const data = {};
  const errors = [];

  try {
    const { headers } = await request['head'](url);
    data.headers = headers;
  } catch (error) {
    log(error);
    errors.push(error);
  }

  if (data.headers && data.headers['content-type'] && data.headers['content-type'].startsWith('text/html')) {
    try {
      const oembed = promisify(new embedly({ key: process.env.EMBEDLY_KEY }).oembed);
      data.embed = await oembed({ url });
    } catch (error) {
      log(error);
      errors.push(error);
    }
    try {
      data.info = await promisify(youtubedl.getInfo)(url, ['--no-check-certificate']);
    } catch (error) {
      log(error);
      errors.push(error);
    }
  } else {
    try {
      const { FFPROBE = ffprobeStatic.path } = process.env;
      data.media = await ffprobe(url, { path: FFPROBE });
    } catch (error) {
      log(error);
      errors.push(error);
    }
  }

  if (errors.length > 0) data.errors = errors;
  return data;
};

const processURL = async url => {
  const data = await inspectURL(url);
  const errors = [];

  const id = uuidv4();
  const dir = tmp.dirSync();
  let extension = 'mp4';
  log(id, dir.name);

  if (data.headers && data.headers['content-type'] && data.headers['content-type'].startsWith('text/html')) {
    if (data.info && data.info.ext) extension = data.info.ext.toLowerCase();
    try {
      await download(url, dir, id, extension);
    } catch (error) {
      log(error);
      errors.push(error);
    }
  } else {
    try {
      const response = await request(url);
      log(response.headers);

      let contentType = 'application/octet-stream';
      if (response.headers['content-type']) contentType = response.headers['content-type'];

      extension = mime.extension(contentType).toLowerCase();
      await response.saveTo(`${dir.name}/${id}.${extension}`);
    } catch (error) {
      log(error);
      errors.push(error);
    }
  }

  log(`${dir.name}/${id}.${extension}`);
  try {
    const { FFPROBE = ffprobeStatic.path } = process.env;
    data.file = await ffprobe(`${dir.name}/${id}.${extension}`, { path: FFPROBE });
  } catch (error) {
    log(error);
    errors.push(error);
  }

  // fingerprint
  try {
    const results = await python('audfprint.py', {
     scriptPath: '/usr/src/audfprint/',
     args: ['precompute', `${dir.name}/${id}.${extension}`, '-p', dir.name]
    });
    log(results);

    // upload
    const fingerprint = await readFile(`${dir.name}/${dir.name}/${id}.afpt`);
    await putObject({
      Body: fingerprint,
      ACL: 'public-read',
      Bucket: 'fingerprints.contextubot.net', // TODO -> ENV
      // Key: `${prefix.reverse().join('/')}/${id}/${id}.afpt`,
      Key: `test/${id}/${id}.afpt`
    });

    // compute link
    const link = `https://s3.amazonaws.com/fingerprints.contextubot.net/test/${id}/${id}.afpt`;
    data.fingerprint = link;
    log(link);
  } catch (error) {
    log(error);
    errors.push(error);
  }

  if (errors.length > 0) {
    if (!data.errors) data.errors = [];
    data.errors = data.errors.concat(errors);
  }
  return data;
};

const download = (url, dir, id, extension) => new Promise((resolve, reject) => {
  // const { YTDL = ??? } = process.env;
  var video = youtubedl(url, ['--no-check-certificate'], { cwd: dir.name });
  video.pipe(fs.createWriteStream(`${dir.name}/${id}.${extension}`));
  video.on('end', () => resolve());
  video.on('error', error => reject(error));
});


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
