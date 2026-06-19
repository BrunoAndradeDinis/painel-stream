import { S3Client } from '@aws-sdk/client-s3';

// As chaves devem vir do novo .env (lembre-se de configurar no painel-stream/.env.local)
const MGC_ACCESS_KEY_ID = process.env.MGC_ACCESS_KEY_ID || '';
const MGC_SECRET_ACCESS_KEY = process.env.MGC_SECRET_ACCESS_KEY || '';
let MGC_ENDPOINT = process.env.MGC_ENDPOINT || 'https://br-se1.magaluobjects.com';
const MGC_BUCKET_NAME = process.env.MGC_BUCKET_NAME || '';

// Corrige o endpoint se o usuário informou o estilo Virtual Hosted (com o nome do bucket no início)
if (MGC_BUCKET_NAME && MGC_ENDPOINT.includes(`${MGC_BUCKET_NAME}.`)) {
  MGC_ENDPOINT = MGC_ENDPOINT.replace(`${MGC_BUCKET_NAME}.`, '');
}

export const s3Client = new S3Client({
  region: 'br-se1',
  endpoint: MGC_ENDPOINT,
  credentials: {
    accessKeyId: MGC_ACCESS_KEY_ID,
    secretAccessKey: MGC_SECRET_ACCESS_KEY,
  },
  forcePathStyle: true,
});
export { MGC_BUCKET_NAME };
