import debug from 'debug';

import fs from 'fs';
import { promisify } from 'util';

import Promise from 'promise';
import AWS from 'aws-sdk';
import tmp from 'tmp';

import express from 'express';
import logger from 'morgan';
import bodyParser from 'body-parser';

import self from '../package';

const log = debug('contextubot:api');

// const writeFile = promisify(fs.writeFile);
// const readFile = promisify(fs.readFile);

AWS.config.update({
  accessKeyId: process.env.AWS_ID,
  secretAccessKey: process.env.AWS_SECRET,
});

const s3 = new AWS.S3();

// const getObject = (params) => {
//   return new Promise((fulfill, reject) => {
//     s3.getObject(params, (err, res) => {
//       if (err) reject(err);
//       else fulfill(res);
//     });
//   });
// };
//
// const putObject = (params) => {
//   return new Promise((fulfill, reject) => {
//     s3.putObject(params, (err, res) => {
//       if (err) reject(err);
//       else fulfill(res);
//     });
//   });
// };

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

app.post('/', (req, res) => {
  log(req.body);
  res.send({});
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
