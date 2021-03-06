import debug from 'debug';

import fs from 'fs';
import { promisify } from 'util';
import Promise from 'promise';

import uuidv4 from 'uuid/v4';
import mime from 'mime-types';
import tmp from 'tmp';
import request from 'requisition';
import rrequest from 'request';
import urlParse from 'url-parse';

import express from 'express';
import logger from 'morgan';
import bodyParser from 'body-parser';
import cors from 'cors';

import PythonShell from 'python-shell';
import ffprobe from 'ffprobe';
import ffprobeStatic from 'ffprobe-static';
import embedly from 'embedly';
import youtubedl from 'youtube-dl';
import PubNub from 'pubnub';

import { putObject, getObject } from './aws';
import self from '../package';

const log = debug('contextubot:api');

const writeFile = promisify(fs.writeFile);
const readFile = promisify(fs.readFile);
const python = promisify(PythonShell.run);

const app = express();
tmp.setGracefulCleanup();

const pubnub = new PubNub({
    subscribeKey: "sub-c-79339ef4-3622-11e8-8741-e2a40c21c595",
    publishKey: "pub-c-0c10c685-2b8a-4aa9-a835-766676172c5a",
    secretKey: "sec-c-NjhjYjM3ZjAtYTU3ZS00NDM4LWIwMWEtYTU2NDVlNTM4MDBl",
    ssl: true
})

app.disable('x-powered-by');
app.use(logger('dev', {
  skip: () => app.get('env') === 'test'
}));
// app.use(bodyParser.json());
// app.use(bodyParser.urlencoded({ extended: false }));

app.use(cors());
app.options('*', cors());

app.get('/', async (req, res) => {
  const { url } = req.query;

  const data = await inspectURL(url);
  // const data = await processURL(url);

  data[self.name] = self.version;
  res.send(data);
});

// app.get('/match', async (req, res) => {
//   const data = await match('/opt/app/test/test.afpt');
//
//   data[self.name] = self.version;
//   res.send(data);
// });

const match = (file, prefix) => {
  return new Promise((fulfill, reject) => {
    const result = { data: [], errors: [] };
    const rows = [];

    const script = new PythonShell('fprint.py', {
      scriptPath: '/opt/app/scripts/',
      args: ['match', file, prefix], //
      mode: 'text'
    });

    script.on('message', function (message) {
      rows.push(message);
    });

    script.end(function (err) {
      console.log(err);
      if (err && err.exitCode !== 0) {
        if (!result.errors) result.errors = [];
        result.errors.append(err);
      }
      result.data = rows.map(row => {
        let [duration, start, from, time, source, sourceId, nhashaligned, aligntime, nhashraw, rank, mintime, maxtime, thop] = row.split(',');
        duration = parseFloat(duration);
        start = parseFloat(start);
        time = parseFloat(time);
        thop = parseFloat(thop);
        nhashaligned = parseInt(nhashaligned);
        aligntime = parseInt(aligntime);
        nhashraw = parseInt(nhashraw);
        rank = parseInt(rank);
        mintime = parseInt(mintime);
        maxtime = parseInt(maxtime);
        sourceId = parseInt(sourceId);
        return {duration, start, from, time, source, sourceId, nhashaligned, aligntime, nhashraw, rank, mintime, maxtime, thop};
      });
      if (result.errors.length === 0) delete result.errors;
      fulfill(result);
    });
  });
};

app.post('/', bodyParser.json(), async (req, res) => {
  log(req.body);
  const { url } = req.query;

  const data = await processURL(url);

  res.send(data);
});

app.post('/event', bodyParser.json(), async (req, res) => {
  log(req.body);

  const data = await processEvent(req.body);

  res.send(data);
});

const processEvent = async event => {
  const { Records } = event;
  if (! Records) return { error: 'no records' } ;

  return { data: await processRecord(Records[0]) }
}

const processRecord = async (record) => {
  const id = uuidv4();
  const dir = tmp.dirSync();
  log(id, dir.name);

  const data = await getObject({
    Bucket: record.s3.bucket.name,
    Key: record.s3.object.key
  });

  await writeFile(`${dir.name}/${id}.afpt`, data.Body);

  let results;
  try {
     results = await python('ingest.py', {
     scriptPath: '/opt/app/scripts/',
     args: [`${dir.name}/${id}.afpt`, id, record.s3.object.key]
    });
    log(results);
  } catch (error) {
    log(error);
  }

  return results;
}

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

  // subclip 1 minute to audio
  // or reject longer tracks

  // fingerprint
  try {
    const results = await python('audfprint.py', {
     scriptPath: '/usr/src/audfprint/', // '/opt/app/scripts/audfprint/',
     args: [
       'precompute',
       '--samplerate', '11025',
       '--density', '20',
       '--shifts', '1',
       '--maxtimebits', '32',
       `${dir.name}/${id}.${extension}`,
       '-p', dir.name
     ]
    });
    log(results);

    // upload
    const fingerprint = await readFile(`${dir.name}${dir.name}/${id}.afpt`);
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

  data.matches = [];
  const channels = [
    'BBCNEWS',
    'CNNW',
    'FOXNEWSW',
    'MSNBCW'
  ];
  const dates = ['20180323', '20180324', '20180325', '20180326', '20180327', '20180328', '20180329', '20180330'];

  for (let c = 0; c < channels.length; c++) {
    for (let d = 0; d < dates.length; d++) {
      const matches = (await match(`${dir.name}${dir.name}/${id}.afpt`, `${channels[c]}_${dates[d]}_%`)).data;
      pubnub.publish({
        message: {
            data: matches
        },
        channel: 'Channel-4lnxljbjk',
        sendByPost: false, // true to send via post
        storeInHistory: false, //override default storage options
        meta: {
          channel: channels[c],
          date: dates[d]
        }
      }, (status, response) => console.log(status, response));
      data.matches = data.matches.concat(matches);

       // match(`${dir.name}${dir.name}/${id}.afpt`, `${channels[c]}_${dates[d]}_%`)
       // .then(({ data }) => {
       //   pubnub.publish({
       //     message: {
       //         data: data
       //     },
       //     channel: 'Channel-4lnxljbjk',
       //     sendByPost: false, // true to send via post
       //     storeInHistory: false, //override default storage options
       //   }, (status, response) => console.log(status, response));
       // })
    }
  }

  // data.matches =  (await match(`${dir.name}${dir.name}/${id}.afpt`)).data;

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


app.get('/proxy', function(req, res) {
  const { url } = req.query;
  const parsedUrl = new urlParse(url);
  if (parsedUrl.hostname.endsWith('archive.org')) {
    req.pipe(rrequest(url), {end: true}).pipe(res, {end: true});
  } else {
    res
      .status(418)
      .send({ error: [{ message: 'I\'m a teapot' }] });
  }
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
