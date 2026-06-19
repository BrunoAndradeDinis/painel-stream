import { NextResponse } from 'next/server';
import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { s3Client, MGC_BUCKET_NAME } from '@/lib/s3';

async function streamToString(stream: any): Promise<string> {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf-8');
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const channel = searchParams.get('channel');

  if (!channel) {
    return NextResponse.json({ error: 'Missing channel parameter' }, { status: 400 });
  }

  const key = `${channel}/songs.json`;

  try {
    const command = new GetObjectCommand({
      Bucket: MGC_BUCKET_NAME,
      Key: key,
    });
    const response = await s3Client.send(command);
    const bodyString = await streamToString(response.Body);
    return NextResponse.json(JSON.parse(bodyString));
  } catch (error: any) {
    // If file does not exist, return an empty array
    if (error.name === 'NoSuchKey' || error.name === 'NotFound') {
      return NextResponse.json([]);
    }
    console.error('Error fetching songs.json:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { channel, song } = body;

    if (!channel || !song) {
      return NextResponse.json({ error: 'Missing channel or song data' }, { status: 400 });
    }

    const key = `${channel}/songs.json`;
    let currentSongs = [];

    // Tenta buscar o arquivo existente
    try {
      const getCommand = new GetObjectCommand({
        Bucket: MGC_BUCKET_NAME,
        Key: key,
      });
      const getResponse = await s3Client.send(getCommand);
      const bodyString = await streamToString(getResponse.Body);
      currentSongs = JSON.parse(bodyString);
    } catch (error: any) {
      // Ignora se não existir, currentSongs será []
    }

    // Adiciona a nova música
    currentSongs.push(song);

    // Salva o JSON atualizado
    const putCommand = new PutObjectCommand({
      Bucket: MGC_BUCKET_NAME,
      Key: key,
      Body: JSON.stringify(currentSongs, null, 2),
      ContentType: 'application/json',
      ACL: 'public-read', // Tornar o JSON público pode ser útil para o worker da rádio ler fácil
    });

    await s3Client.send(putCommand);

    return NextResponse.json({ success: true, songs: currentSongs });
  } catch (error: any) {
    console.error('Error updating songs.json:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
