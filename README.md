# AuraStream Painel (`painel-stream`)

O `painel-stream` é o painel administrativo e de controle para a plataforma de streaming e rádio online **AuraStream**. Ele funciona como a interface de gerenciamento centralizada, permitindo o upload de mídias (áudio, vídeo e imagens), gerenciamento de metadados das faixas em execução, provisionamento e controle de ciclo de vida das Máquinas Virtuais (VMs) na Magalu Cloud, e controle remoto em tempo real do daemon de transmissão (**AuraStream Engine**) que executa em cada VM.

Desenvolvido utilizando **Next.js 16 (App Router)**, **React 19**, **TypeScript** e **Tailwind CSS v4**, o sistema interage com o **Neon Serverless PostgreSQL** e com o **Magalu Cloud Object Storage (S3)**.

---

## 1. Visão Geral da Arquitetura

O sistema é baseado em uma arquitetura serverless híbrida para o painel de controle, conectando-se a instâncias de computação dedicada que executam o motor de transmissão (FFmpeg + Node.js).

```mermaid
graph TD
    Browser[Navegador do Usuário] <-->|HTTPS / JSON / Session Cookie| NextServer[Servidor Next.js - Vercel]
    NextServer <-->|SQL / TCP| Neon[Neon Serverless PostgreSQL]
    NextServer <-->|S3 API / HTTPS| MGC_Storage[Magalu Cloud Object Storage]
    NextServer <-->|REST API / HTTPS| MGC_Compute[Magalu Cloud Compute API]
    
    %% Proxy & Daemon Connection
    NextServer <-->|HTTP / Port 9004| AuraEngine[AuraStream Engine - VM da Magalu]
    Browser -.->|Bloqueado por Mixed Content| AuraEngine
    
    %% M2M Telemetria
    AuraEngine --->|Heartbeat & Telemetria / HTTP| NextServer
```

### Componentes Principais da Arquitetura:
1. **Next.js Server (BFF - Backend for Frontend)**: Executa as funções de API do lado do servidor (Serverless Functions), controlando a autenticação, proxying de requisições, gravação de logs e interações com APIs de terceiros.
2. **Neon Serverless PostgreSQL**: Armazena as tabelas relacionais de usuários e o cache de estados das VMs registradas ativamente no ecossistema.
3. **Magalu Cloud Object Storage**: Bucket compatível com a API S3 da AWS. Armazena os arquivos de áudio (`.mp3`), vídeos promocionais, imagens de álbum (`.png`/`.jpg`) e o banco de metadados JSON (`songs.json`) de cada canal de rádio.
4. **Magalu Cloud Compute API**: Utilizada para consultar o status de hardware das VMs (CPU, RAM, Disco) e gerenciar comandos de ciclo de vida (Ligar, Desligar, Reiniciar) diretamente pela API de nuvem.
5. **AuraStream Engine (VM)**: Um daemon rodando na porta `9004` da máquina virtual que gerencia a fila do FFmpeg e transmite para os servidores RTMP/Icecast. Ele se comunica com o Painel via Heartbeats e expõe uma API HTTP para controle de reprodução.

---

## 2. Fluxos Técnicos Detalhados

### 2.1 Bypass de Bloqueio de Conteúdo Misto (Mixed Content)
Como o painel administrativo roda em ambiente seguro sob HTTPS (geralmente implantado na Vercel), o navegador do usuário bloqueia requisições HTTP puras (`http://<IP_DA_VM>:9004/api/...`) devido a restrições de segurança do navegador (*Mixed Content*). 

Para contornar este limite de forma segura, o painel implementa um **Proxy de Servidor para Servidor** em `src/app/api/vm-proxy/[vmIp]/[...path]/route.ts`:

```mermaid
sequenceDiagram
    participant Browser as Navegador (HTTPS)
    participant Proxy as Next.js API Proxy (HTTPS)
    participant VM as AuraStream Engine (HTTP)

    Browser->>Proxy: POST /api/vm-proxy/200.50.81.12/command { "event": "media:skip" }
    Note over Proxy: Valida IP por Regex (SSRF Protection)<br/>Timeout de 5s via AbortController
    Proxy->>VM: POST http://200.50.81.12:9004/api/command { "event": "media:skip" }
    VM-->>Proxy: 200 OK (Novo estado da fila)
    Proxy-->>Browser: 200 OK (JSON)
```

### 2.2 Upload de Mídia e Orquestração de Metadados
Ao realizar o upload de uma música, o painel envia o arquivo diretamente para o servidor Next.js, que se encarrega de enviá-lo para a Magalu Cloud Object Storage utilizando a ACL `public-read`. Isso contorna limitações da API de URLs pré-assinadas (Presigned URLs) da Magalu Cloud no tratamento de Content-Types e ACLs públicas.

```mermaid
sequenceDiagram
    participant User as Usuário
    participant Next as Next.js API
    participant S3 as Magalu Object Storage
    
    User->>Next: Envia formulário com MP3 e metadados adicionais
    Next->>S3: PutObjectCommand (Arquivo de Áudio / ACL public-read)
    S3-->>Next: Confirma gravação
    Next->>S3: GetObjectCommand (Obtém songs.json do Canal)
    S3-->>Next: Retorna array de músicas atual
    Note over Next: Insere nova música ao array e gera novo JSON
    Next->>S3: PutObjectCommand (Salva songs.json / ACL public-read)
    S3-->>Next: Confirma gravação
    Next-->>User: Sucesso
```

---

## 3. Modelo de Dados (Banco de Dados)

O banco de dados PostgreSQL possui duas tabelas fundamentais, criadas a partir do script `scripts/migrate.ts`.

### Tabela `users`
Armazena as credenciais administrativas e níveis de privilégios de acesso ao painel.
* **`id`** (`SERIAL PRIMARY KEY`): Identificador único auto-incremental.
* **`username`** (`TEXT UNIQUE NOT NULL`): Nome de usuário para autenticação.
* **`password_hash`** (`TEXT NOT NULL`): Hash de senha gerado com bcrypt (10 rounds).
* **`role`** (`TEXT NOT NULL DEFAULT 'uploader'`): Nível de privilégio. Pode ser `'admin'` ou `'uploader'`.
* **`created_at`** (`TIMESTAMPTZ NOT NULL DEFAULT NOW()`): Carimbo de data/hora de criação do registro.

### Tabela `vms`
Armazena a telemetria básica recebida através de heartbeats das máquinas de transmissão ativas.
* **`id`** (`TEXT PRIMARY KEY`): O UUID ou ID da instância gerado pela Magalu Cloud.
* **`name`** (`TEXT NOT NULL`): Nome da máquina virtual.
* **`status`** (`TEXT NOT NULL DEFAULT 'offline'`): Estado operacional da transmissão (ex: `streaming`, `idle`, `offline`).
* **`current_channel`** (`TEXT`): O canal de rádio sendo transmitido no momento.
* **`last_ping`** (`TIMESTAMPTZ NOT NULL DEFAULT NOW()`): Carimbo de hora do último ping enviado pelo daemon de transmissão.

---

## 4. Variáveis de Ambiente (`.env`)

Para rodar a aplicação, crie um arquivo `.env` na raiz do diretório `painel-stream/` com as seguintes configurações:

```ini
# --- Credenciais de Object Storage (Magalu Cloud Objects) ---
MGC_ACCESS_KEY_ID="seu-access-key-id-magalu"
MGC_SECRET_ACCESS_KEY="sua-secret-access-key-magalu"
MGC_ENDPOINT="https://br-se1.magaluobjects.com" # Ou endpoint virtual-hosted style
MGC_BUCKET_NAME="nome-do-seu-bucket"

# --- Configurações de API e Monitoramento de VMs (Magalu Cloud Compute) ---
MGC_API_KEY="sua-api-key-do-portal-magalu-cloud"
MGC_REGION="br-se1"

# --- Autenticação e Segurança do Painel ---
JWT_SECRET="chave-ultra-secreta-para-geracao-de-tokens-jwt"
ADMIN_USERNAME="admin"       # Usuário admin padrão criado na migração seed
ADMIN_PASSWORD="admin123"     # Senha provisória do admin padrão

# --- Conexão PostgreSQL (Neon) ---
DATABASE_URL="postgresql://usuario:senha@host/db?sslmode=require"

# --- Comunicação Interna M2M ---
INTERNAL_API_KEY="chave-de-api-compartilhada-entre-vm-e-painel"
```

---

## 5. Estrutura do Projeto

Abaixo está descrita a finalidade dos principais arquivos na árvore do projeto:

```text
painel-stream/
├── scripts/
│   └── migrate.ts            # Script de migração de tabelas e injeção do usuário Admin (Seed).
├── src/
│   ├── app/
│   │   ├── (dashboard)/      # Grupo de rotas protegidas que compartilham o layout administrativo.
│   │   │   ├── layout.tsx    # Layout da dashboard (menu lateral, barra de topo mobile e logout).
│   │   │   ├── page.tsx      # Tela de Upload de mídias e registro de metadados.
│   │   │   ├── users/        # Sub-rota: Tela de CRUD de usuários da equipe.
│   │   │   └── vms/          # Sub-rota: Lista de VMs monitoradas e acionadores de controle remoto.
│   │   ├── api/              # Endpoints HTTP REST (Serverless API Routes).
│   │   │   ├── admin/        # APIs administrativas (Upload, canais do S3, metadados e logs).
│   │   │   ├── auth/         # APIs públicas para controle de sessão (Login e Logout).
│   │   │   ├── users/        # APIs para gerenciamento CRUD de usuários (GET, POST, PATCH, DELETE).
│   │   │   ├── vm-proxy/     # Proxy reverso HTTP para contornar Mixed Content no acesso às VMs.
│   │   │   └── vms/          # Endpoints de integração com a API da Magalu Cloud e Heartbeat de VMs.
│   │   ├── login/            # Sub-rota pública: Tela de Login.
│   │   ├── globals.css       # Configuração global de Tailwind CSS e design system.
│   │   └── layout.tsx        # Layout raiz da aplicação.
│   ├── components/
│   │   └── VmRemoteControl.tsx # Componente do Drawer de Controle Remoto das VMs (Controles de player e fila).
│   ├── lib/                  # Bibliotecas internas e inicializadores de clientes.
│   │   ├── auth.ts           # Auxiliares para assinatura e verificação de JWT usando 'jose'.
│   │   ├── db.ts             # Instanciação do driver do Neon PostgreSQL Serverless SQL.
│   │   ├── rate-limit.ts     # Limitador de requisições em memória baseado em 'lru-cache'.
│   │   └── s3.ts             # Configuração e instância do cliente S3 AWS SDK da Magalu.
│   └── middleware.ts         # Middleware global do Next.js (Gerenciamento de sessão, autenticação e M2M API Keys).
├── .env                      # Variáveis de ambiente locais (não versionado).
├── package.json              # Configurações de dependências e scripts npm.
└── tsconfig.json             # Configuração de compilação do TypeScript.
```

---

## 6. Referência Detalhada de Endpoints (API)

Todas as rotas sob `/api` possuem camadas de autenticação descritas abaixo, processadas globalmente no `middleware.ts`.

### 6.1 Autenticação e Usuários

#### `POST /api/auth/login`
Autentica o usuário no sistema e injeta um cookie HTTP-only contendo o token JWT.
* **Autenticação**: Pública.
* **Rate Limit**: Máximo de 5 tentativas a cada 5 minutos por IP (armazenado em cache LRU local).
* **Payload de Entrada**:
  ```json
  {
    "username": "admin",
    "password": "senha-de-acesso"
  }
  ```
* **Payload de Resposta (200 OK)**:
  ```json
  {
    "success": true,
    "role": "admin"
  }
  ```

#### `POST /api/auth/logout`
Destrói a sessão apagando o cookie `painel_session` do navegador.
* **Autenticação**: Pública.
* **Payload de Resposta (200 OK)**:
  ```json
  {
    "success": true
  }
  ```

#### `GET /api/users`
Lista todos os usuários da equipe ordenados por data de criação.
* **Autenticação**: Sessão ativa (Cookie JWT).
* **Payload de Resposta (200 OK)**:
  ```json
  {
    "users": [
      {
        "id": 1,
        "username": "admin",
        "role": "admin",
        "created_at": "2026-07-08T10:00:00.000Z"
      }
    ]
  }
  ```

#### `POST /api/users`
Cria um novo usuário da equipe.
* **Autenticação**: Sessão ativa de usuário com role `'admin'`.
* **Payload de Entrada**:
  ```json
  {
    "username": "novo.uploader",
    "password": "senha-forte-min-6",
    "role": "uploader"
  }
  ```
* **Payload de Resposta (200 OK)**:
  ```json
  {
    "success": true,
    "id": 2
  }
  ```

#### `PATCH /api/users/[id]`
Atualiza cargo e/ou a senha de um usuário específico.
* **Autenticação**: Sessão ativa de usuário com role `'admin'`.
* **Regra de Negócio**: Impede rebaixar/modificar cargo do único administrador cadastrado no banco.
* **Payload de Entrada**:
  ```json
  {
    "role": "admin",
    "password": "nova-senha-opcional"
  }
  ```

#### `DELETE /api/users/[id]`
Remove permanentemente um usuário do banco.
* **Autenticação**: Sessão ativa de usuário com role `'admin'`.
* **Regra de Negócio**: Impede a exclusão do próprio usuário conectado ou do único administrador remanescente no sistema.

---

### 6.2 Monitoramento e Ações de VM (Magalu Cloud)

#### `GET /api/vms`
Consulta a API da Magalu Cloud Compute, retornando a lista de VMs criadas na região com suas respectivas especificações técnicas de hardware traduzidas.
* **Autenticação**: Sessão ativa (Cookie JWT).
* **Headers de Integração**: Usa `MGC_API_KEY` nos cabeçalhos da requisição externa à Magalu Cloud.
* **Cache**: Cache estático revalidado via Next.js ISR a cada 30 segundos.
* **Payload de Resposta (200 OK)**:
  ```json
  {
    "vms": [
      {
        "id": "e0bfa934-bf38-422e-bf73-61a7a13d7fb1",
        "name": "aurastream-sp-01",
        "state": "running",
        "rawState": "running",
        "operationStatus": null,
        "availabilityZone": "br-se1-a",
        "machineType": "mgc.c1.m2",
        "vcpus": 2,
        "ramGb": 4,
        "diskGb": 50,
        "publicIp": "200.80.90.100",
        "privateIp": "10.0.0.15",
        "sshKeyName": "chave-prod",
        "createdAt": "2026-06-01T12:00:00Z",
        "updatedAt": "2026-07-08T10:15:00Z",
        "error": null
      }
    ],
    "region": "br-se1"
  }
  ```

#### `POST /api/vms/[id]/action`
Envia um sinal de controle energético (Ligar, Desligar, Reiniciar) para a VM correspondente no painel da nuvem.
* **Autenticação**: Sessão ativa (Cookie JWT).
* **Payload de Entrada**:
  ```json
  {
    "action": "start" // Opções válidas: "start", "stop", "reboot"
  }
  ```
* **Payload de Resposta (200 OK)**:
  ```json
  {
    "success": true,
    "message": "Comando start enviado."
  }
  ```

#### `POST /api/vms/heartbeat`
Rota M2M (Máquina a Máquina) utilizada pelos daemons de transmissão ativas para atualizar seu estado de operação interna no painel (Upsert na tabela `vms`).
* **Autenticação**: Header `x-api-key` igual ao `INTERNAL_API_KEY` do ambiente.
* **Payload de Entrada**:
  ```json
  {
    "id": "e0bfa934-bf38-422e-bf73-61a7a13d7fb1",
    "name": "aurastream-sp-01",
    "status": "streaming",
    "current_channel": "aurastream-lofi"
  }
  ```

---

### 6.3 Upload, Canais e Metadados

#### `GET /api/admin/channels`
Obtém uma lista de pastas (canais) localizados no bucket S3.
* **Autenticação**: Sessão ativa (Cookie JWT).
* **Operação**: Executa um `ListObjectsV2Command` no S3 filtrado pelo Delimiter `/`. Retorna os prefixos encontrados. Se vazio, retorna `["aurastream"]` como valor padrão.

#### `GET /api/admin/metadata`
Obtém o conteúdo do banco de metadados da rádio (`songs.json`) do canal desejado.
* **Autenticação**: Sessão ativa (Cookie JWT).
* **Query Parameters**: `?channel=nome-do-canal`
* **Resposta (200 OK)**: Retorna a lista de músicas cadastradas. Caso o arquivo no S3 não exista, retorna um array vazio `[]` de fallback.

#### `POST /api/admin/metadata`
Adiciona uma nova música com seus respectivos dados de streaming no fim do arquivo `songs.json` hospedado no S3.
* **Autenticação**: Sessão ativa (Cookie JWT).
* **Payload de Entrada**:
  ```json
  {
    "channel": "aurastream-lofi",
    "song": {
      "song": {
        "author": "CERES x TAME",
        "song_name": "Pull Me Down"
      },
      "s3_audio_url": "https://br-se1.magaluobjects.com/bucket/aurastream-lofi/songs/song.mp3",
      "provider": "AuraStream Originals",
      "album_image": "https://br-se1.magaluobjects.com/bucket/aurastream-lofi/images/capa.jpg",
      "watch_url": "http://youtube.com/...",
      "added_at": "2026-07-08T10:20:00.000Z"
    }
  }
  ```

#### `POST /api/admin/upload`
Processa o upload direto via HTTP Multiplexed (`multipart/form-data`) de arquivos para a Magalu Cloud Objects, salvando na pasta correta com base no canal e tipo de mídia.
* **Autenticação**: Sessão ativa (Cookie JWT).
* **Parâmetros Form Data**:
  * `file`: Arquivo Binário.
  * `channel`: Nome do Canal (String).
  * `mediaType`: Tipo de Mídia (`audio`, `video`, `image`).
* **Estrutura de diretórios criada no bucket**:
  * Se `mediaType` for `'audio'` $\rightarrow$ `channel/songs/nome-do-arquivo.mp3`
  * Se `mediaType` for `'video'` $\rightarrow$ `channel/video/nome-do-arquivo.mp4`
  * Se `mediaType` for `'image'` $\rightarrow$ `channel/images/nome-do-arquivo.jpg`
* **Payload de Resposta (200 OK)**:
  ```json
  {
    "publicUrl": "https://br-se1.magaluobjects.com/bucket/canal/songs/musica.mp3",
    "key": "canal/songs/musica.mp3"
  }
  ```

---

### 6.4 Proxy da Máquina Virtual

#### `GET /api/vm-proxy/[vmIp]/state`
Consome o estado atual da fila de streaming diretamente da porta 9004 do daemon rodando na VM.
* **Autenticação**: Sessão ativa (Cookie JWT).

#### `POST /api/vm-proxy/[vmIp]/command`
Envia um evento/comando para controlar a reprodução do daemon (ex: Play, Pause, Skip, Ajustar Volume, Reordenar).
* **Autenticação**: Sessão ativa (Cookie JWT).
* **Payload de Entrada**:
  ```json
  {
    "event": "media:play", // Ex: "media:play", "media:pause", "media:skip", "media:stop_stream", "media:volume", "queue:reorder", "player:track_changed"
    "payload": 0.8 // Valor opcional do payload dependendo da ação (ex: volume)
  }
  ```

---

## 7. Instruções de Execução Local e Migração

### Pré-requisitos
Certifique-se de possuir o **Node.js (v20 ou superior)** instalado na sua máquina.

### Passo 1: Instalar Dependências
Instale todos os pacotes definidos no arquivo `package.json`:
```bash
npm install
# ou
yarn install
```

### Passo 2: Executar as Migrações do Banco de Dados
Com as variáveis de ambiente devidamente configuradas no arquivo `.env`, rode o script TypeScript de criação de tabelas e injeção do usuário inicial:
```bash
npx tsx scripts/migrate.ts
```
Este comando criará as tabelas `users` e `vms` no Neon PostgreSQL e cadastrará o administrador padrão definido nas variáveis `ADMIN_USERNAME` e `ADMIN_PASSWORD` (caso a tabela esteja vazia).

### Passo 3: Iniciar o Servidor de Desenvolvimento
Inicie o compilador hot-reload local do Next.js:
```bash
npm run dev
```
O painel estará disponível na URL: [http://localhost:3000](http://localhost:3000).

---

## 8. Decisões de Implementação Tecnológica

1. **Next.js 16 + React 19**: Utilização das versões mais modernas do ecossistema, se beneficiando do melhor desempenho do compilador React Server Components (RSC) e do novo runtime do Next.js.
2. **`jose` vs `jsonwebtoken`**: A biblioteca `jose` é puramente baseada em APIs de Web Standards (Crypto API), o que a torna compatível nativamente com o Next.js Middleware e Edge Runtimes, algo inviável para pacotes baseados em módulos nativos de Node.js como `bcrypt` ou `jsonwebtoken`.
3. **`lru-cache` para Rate Limiting**: Escolhido para controle simples em memória de ataques de força bruta à tela de login. Como a aplicação roda como uma instância única em teste local ou pequenos VPS, o cache resolve de maneira enxuta, eliminando dependências externas de infraestrutura como Redis para o ambiente de testes.
4. **AWS SDK V3 compatível com S3**: O Object Storage da Magalu Cloud é totalmente compatível com a API padrão do Amazon S3, o que permite o uso dos clientes otimizados e modulares `@aws-sdk/client-s3`, reduzindo o tamanho do bundle final de compilação.
