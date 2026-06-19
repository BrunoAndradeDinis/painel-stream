import { NextResponse } from 'next/server';
import { ListObjectsV2Command } from '@aws-sdk/client-s3';
import { s3Client, MGC_BUCKET_NAME } from '@/lib/s3';

export async function GET() {
  try {
    const command = new ListObjectsV2Command({
      Bucket: MGC_BUCKET_NAME,
      Delimiter: '/', // Delimitador para pegar apenas o "nível raiz" como se fossem pastas
    });

    const response = await s3Client.send(command);

    // CommonPrefixes contém as "pastas" do S3 terminadas com "/"
    const channels = response.CommonPrefixes
      ?.map((prefix) => prefix.Prefix?.replace('/', '')) // Remove a barra no final
      .filter(Boolean) || [];

    // Se o bucket estiver vazio ou não tiver pastas com "/", retornamos um default
    if (channels.length === 0) {
      channels.push('aurastream'); 
    }

    return NextResponse.json({ channels });
  } catch (error: any) {
    console.error('Error listing channels from S3:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
