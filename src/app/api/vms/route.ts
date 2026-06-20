import { NextResponse } from 'next/server';

const MGC_API_KEY = process.env.MGC_API_KEY || '';
const MGC_REGION = process.env.MGC_REGION || 'br-se1';
const MGC_BASE_URL = `https://api.magalu.cloud/${MGC_REGION}/compute/v1`;

// Mapeia o `state` da MGC para um status legível
const STATE_LABELS: Record<string, string> = {
  running: 'running',
  stopped: 'stopped',
  suspended: 'suspended',
  error: 'error',
  new: 'provisioning',
  deleted: 'deleted',
};

export interface MgcInstance {
  id: string;
  name: string;
  state: string;
  status: string;
  availability_zone: string;
  created_at: string;
  updated_at: string;
  ssh_key_name?: string;
  machine_type: {
    id: string;
    name?: string;
    vcpus?: number;
    ram?: number;   // MB
    disk?: number;  // GB
  };
  network?: {
    vpc?: { id: string; name: string };
    ports?: Array<{
      id: string;
      name?: string;
      ipAddresses?: {
        publicIpAddress?: string;
        privateIpAddress?: string;
        ipV6Address?: string;
      };
    }>;
  };
  error?: {
    slug?: string;
    message?: string;
  };
}

interface MgcApiResponse {
  instances: MgcInstance[];
}

export async function GET() {
  if (!MGC_API_KEY) {
    return NextResponse.json(
      { error: 'MGC_API_KEY não configurada no servidor.' },
      { status: 500 }
    );
  }

  try {
    const res = await fetch(
      `${MGC_BASE_URL}/instances?expand=machine-type,network`,
      {
        headers: {
          'x-api-key': MGC_API_KEY,
          Accept: 'application/json',
        },
        // Revalida a cada 30 segundos no cache do Next.js
        next: { revalidate: 30 },
      }
    );

    if (!res.ok) {
      const errText = await res.text();
      console.error(`MGC API error ${res.status}:`, errText);
      return NextResponse.json(
        { error: `Erro na API da Magalu Cloud: ${res.status}` },
        { status: res.status }
      );
    }

    const data: MgcApiResponse = await res.json();

    // Normaliza e enriquece os dados para o frontend
    const vms = (data.instances || []).map((vm) => {
      const port = vm.network?.ports?.[0];
      const publicIp = port?.ipAddresses?.publicIpAddress;
      const privateIp = port?.ipAddresses?.privateIpAddress;
      const ram = vm.machine_type?.ram;

      return {
        id: vm.id,
        name: vm.name,
        state: STATE_LABELS[vm.state] ?? vm.state,
        rawState: vm.state,
        operationStatus: vm.status !== 'completed' ? vm.status : null,
        availabilityZone: vm.availability_zone,
        machineType: vm.machine_type?.name ?? 'N/A',
        vcpus: vm.machine_type?.vcpus ?? null,
        ramGb: ram ? Math.round(ram / 1024) : null,
        diskGb: vm.machine_type?.disk ?? null,
        publicIp: publicIp ?? null,
        privateIp: privateIp ?? null,
        sshKeyName: vm.ssh_key_name ?? null,
        createdAt: vm.created_at,
        updatedAt: vm.updated_at,
        error: vm.error?.message ?? null,
      };
    });

    return NextResponse.json({ vms, region: MGC_REGION });
  } catch (err: any) {
    console.error('Erro ao buscar VMs da MGC:', err);
    return NextResponse.json(
      { error: 'Falha ao conectar com a API da Magalu Cloud.' },
      { status: 500 }
    );
  }
}
