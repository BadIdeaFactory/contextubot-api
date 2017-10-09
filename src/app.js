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

import PythonShell from 'python-shell';
import ffprobe from 'ffprobe';
import ffprobeStatic from 'ffprobe-static';
import embedly from 'embedly';
import youtubedl from 'youtube-dl';

import { putObject, getObject } from './aws';
import self from '../package';

const log = debug('contextubot:api');

const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);
const python = promisify(PythonShell.run);

const app = express();
tmp.setGracefulCleanup();

app.disable('x-powered-by');
app.use(logger('dev', {
  skip: () => app.get('env') === 'test'
}));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));


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

  const { headers } = await request['head'](url);
  const data = { headers };

  if (headers['content-type'] && headers['content-type'].startsWith('text/html')) {
    try {
      const oembed = promisify(new embedly({ key: process.env.EMBEDLY_KEY }).oembed);
      data.embed = await oembed({ url });
    } catch (ignored) { log(ignored); }
    try {
      data.media = await promisify(youtubedl.getInfo)(url, ['--no-check-certificate']);
    } catch (ignored) { log(ignored); }
  } else {
    try {
      const { FFPROBE = ffprobeStatic.path } = process.env;
      data.media = await ffprobe(url, { path: FFPROBE });
    } catch (ignored) { log(ignored); }
  }

  return data;
};

const processURL = async url => {
  const data = await inspectURL(url);

  const id = uuidv4();
  const dir = tmp.dirSync();
  let extension;
  log(id, dir.name);

  if (data.headers['content-type'] && data.headers['content-type'].startsWith('text/html')) {
    extension = data.media.ext.toLowerCase();
    try {
      await download(url, dir, id, extension);
    } catch (ignored) { log(ignored); }
  } else {
    try {
      const response = await request(url);
      log(response.headers);

      let contentType = 'application/octet-stream';
      if (response.headers['content-type']) contentType = response.headers['content-type'];

      extension = mime.extension(contentType).toLowerCase();
      await response.saveTo(`${dir.name}/${id}.${extension}`);
    } catch (ignored) { log(ignored); }
  }

  log(`${dir.name}/${id}.${extension}`);

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
  } catch (ignored) { log(ignored); }

  return data;
};

const download = (url, dir, id, extension) => new Promise((resolve, reject) => {
  // const { YTDL = ??? } = process.env;
  var video = youtubedl(url, ['--no-check-certificate'], { cwd: dir.name });
  video.pipe(fs.createWriteStream(`${dir.name}/${id}.${extension}`));
  video.on('end', () => resolve());
  video.on('error', error => reject(error));
});

// // worker code, TODO: adapt to api
// app.post('/', (req, res) => {
//   log(req.body);
//   const { Records } = req.body;
//
//   if (! Records) return res.send({ error: [{ message: 'no records' }] });
//   res.send({ data: Records.map(processRecord) });
// });
//
// const processRecord = async (record) => {
//  const [extension, name, id, ...prefix] = record.s3.object.key.split(/\/|\./).reverse(); // eslint-disable-line no-unused-vars
//  const dir = tmp.dirSync();
//
//  // download
//  const data = await getObject({
//    Bucket: record.s3.bucket.name,
//    Key: record.s3.object.key
//  });
//
//  // save
//  await writeFile(`${dir.name}/${id}.${extension.toLowerCase()}`, data.Body);
//
//  // fingerprint
//  const results = await python('audfprint.py', {
//    scriptPath: '/usr/src/audfprint/',
//    args: ['precompute', `${dir.name}/${id}.${extension.toLowerCase()}`, '-p', dir.name]
//  });
//  log(results);
//
//  // upload
//  const fingerprint = await readFile(`${dir.name}/${dir.name}/${id}.afpt`);
//  const result = await putObject({
//    Body: fingerprint,
//    ACL: 'public-read',
//    Bucket: 'fingerprints.contextubot.net', // TODO -> ENV
//    Key: `${prefix.reverse().join('/')}/${id}/${id}.afpt`
//  });
//
//  // dir.removeCallback(); // FIXME ENOTEMPTY: directory not empty, rmdir
//
//  log(result);
//  return result;
// };
//
// // end worker code


// fingerprint media
// app.post('/fingerprint', async (req, res) => {
//   log(req.body);
//   const { url } = req.body;
//
//   const data = await processURL(url);
//   res.send({ data });
// });

// const processURL = async (url) => {
//   const id = uuidv4();
//   const dir = tmp.dirSync();
//   log(id, dir.name);
//
//   // download
//   const response = await request(url);
//   log(response.headers);
//
//   let contentType = 'application/octet-stream';
//   if (response.headers['content-type']) contentType = response.headers['content-type'];
//
//   const extension = mime.extension(contentType);
//   await response.saveTo(`${dir.name}/${id}.${extension}`)
//
//   // upload (s3)
//   const data = await readFile(`${dir.name}/${id}.${extension}`);
//   const result = await putObject({
//     Body: data,
//     ACL: 'public-read',
//     ContentType: contentType,
//     Bucket: 'ingest.contextubot.net', // TODO -> ENV
//     Key: `test/${id}/${id}.${extension}`
//   });
//   log(result);
//
//   // dir.removeCallback(); // FIXME ENOTEMPTY: directory not empty, rmdir
//
//   // compute link
//   const link = `https://s3.amazonaws.com/fingerprints.contextubot.net/test/${id}/${id}.afpt`;
//   log(link);
//   return link;
// }


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
