import { NextResponse } from 'next/server';
import { PutObjectCommand, PutObjectAclCommand } from '@aws-sdk/client-s3';
import { s3Client, MGC_BUCKET_NAME } from '@/lib/s3';

// Aumentar o limite do body parser para aceitar arquivos grandes (até 500MB)
export const config = {
  api: {
    bodyParser: false,
    responseLimit: false,
  },
};

/**
 * POST /api/admin/upload
 * Recebe o arquivo diretamente (multipart/form-data) e faz PutObject
 * com ContentType e ACL corretos no servidor, evitando os problemas
 * do Magalu Cloud com presigned URLs (ACL ignorada, Content-Type errado).
 */
export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const channel = formData.get('channel') as string | null;
    const mediaType = formData.get('mediaType') as string | null;

    if (!file || !channel || !mediaType) {
      return NextResponse.json({ error: 'Missing required parameters (file, channel, mediaType)' }, { status: 400 });
    }

    // Estrutura de pasta: /nome-do-canal/songs/musica.mp3
    const folder = mediaType === 'video' ? 'video' : (mediaType === 'image' ? 'images' : 'songs');
    const key = `${channel}/${folder}/${file.name}`;

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const command = new PutObjectCommand({
      Bucket: MGC_BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: file.type,
      ACL: 'public-read',
    });

    await s3Client.send(command);

    // A URL final pública
    const endpoint = (process.env.MGC_ENDPOINT || 'https://br-se1.magaluobjects.com').replace(/\/$/, '');
    let publicUrl = '';

    // Se o endpoint já inclui o nome do bucket (Virtual Hosted Style), não duplicamos
    if (endpoint.includes(MGC_BUCKET_NAME)) {
      publicUrl = encodeURI(`${endpoint}/${key}`);
    } else {
      // Path style: endpoint/bucket/key
      publicUrl = encodeURI(`${endpoint}/${MGC_BUCKET_NAME}/${key}`);
    }

    return NextResponse.json({ publicUrl, key });
  } catch (error: any) {
    console.error('Error uploading file:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * PATCH /api/admin/upload
 * Aplica ACL public-read num objeto já existente no bucket.
 * Usado para corrigir objetos que foram enviados sem ACL pública.
 */
export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { key } = body;

    if (!key) {
      return NextResponse.json({ error: 'Missing key parameter' }, { status: 400 });
    }

    const aclCommand = new PutObjectAclCommand({
      Bucket: MGC_BUCKET_NAME,
      Key: key,
      ACL: 'public-read',
    });

    await s3Client.send(aclCommand);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error applying ACL:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
