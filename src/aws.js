import AWS from 'aws-sdk';
import Promise from 'promise';


AWS.config.update({
  accessKeyId: process.env.AWS_ID,
  secretAccessKey: process.env.AWS_SECRET,
});

const s3 = new AWS.S3();

export const getObject = (params) => {
  return new Promise((fulfill, reject) => {
    s3.getObject(params, (err, res) => {
      if (err) reject(err);
      else fulfill(res);
    });
  });
};

export const putObject = (params) => {
  return new Promise((fulfill, reject) => {
    s3.putObject(params, (err, res) => {
      if (err) reject(err);
      else fulfill(res);
    });
  });
};
