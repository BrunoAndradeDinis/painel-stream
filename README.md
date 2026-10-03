# AuraStream Painel (`painel-stream`)

O **AuraStream Painel** (`painel-stream`) é o plano de controle centralizado (*Control Plane*) e interface administrativa da plataforma de rádio e transmissão autônoma **AuraStream**. Ele é responsável por toda a esteira de orquestração do ecossistema: catálogo e upload de mídias (áudio, vídeo e capas de álbum), edição atômica de metadados em buckets S3, gestão de ciclo de vida de instâncias virtuais na nuvem e telemetria/controle remoto bidirecional em tempo real do motor de streaming (**AuraStream Engine**).

Desenvolvido com **Next.js 16 (App Router)**, **React 19**, **TypeScript** e **Tailwind CSS v4**, o sistema opera como um BFF (*Backend for Frontend*) seguro, integrando o **Neon Serverless PostgreSQL** para persistência relacional e o **Magalu Cloud Object Storage (compatível com S3)** para armazenamento e distribuição de mídia em larga escala.

> [!NOTE]
> **Ecossistema & Integração**: Este projeto opera em sinergia direta com o repositório irmão [**project** (AuraStream Engine)](../project), o daemon autônomo que roda nas instâncias de **Compute (VMs) da Magalu Cloud**. Ambos os projetos foram concebidos e implementados como um laboratório prático para validar, testar e estressar em profundidade a infraestrutura e os serviços de nuvem da **Magalu Cloud** (especificamente instâncias de **Compute** e **Object Storage compatível com a API S3**) sob cargas de trabalho reais de streaming multimídia 24/7.

---

## 1. Arquitetura Técnica do Sistema

O painel de controle funciona sob uma topologia híbrida de nuvem, conectando o navegador do administrador a serviços serverless e instâncias de computação dedicada:

```mermaid
graph TD
    %% Camada de Usuário / Browser
    subgraph Cliente Administrativo [Navegador do Usuário]
        BrowserAdmin[Painel Web / Dashboard]
        RemoteDrawer[Drawer de Controle Remoto da VM]
    end

    %% Servidor BFF Next.js
    subgraph Control Plane [Next.js 16 App Router - BFF]
        Middleware[Next.js Middleware - JWT & M2M Auth]
        UploadRoute[API Upload de Mídia /bodySizeLimit 500mb/]
        MetadataRoute[API Metadados do Canal - songs.json]
        VmProxy[SSRF-Protected Reverse Proxy - /api/vm-proxy/]
        VmComputeRoute[API Magalu Compute Instances & Actions]
        HeartbeatRoute[API Heartbeat & Telemetria /api/vms/]
        AuthUsersRoute[API Autenticação & Usuários - bcrypt]
    end

    %% Camada de Dados e Nuvem Magalu
    subgraph Magalu Cloud Infrastructure [Região br-se1]
        MGC_S3[Magalu Cloud Object Storage - S3 Bucket]
        MGC_Compute[Magalu Cloud Compute API v1]
        
        subgraph VM Dedicada [Instância Virtual AuraStream]
            AuraEngine[AuraStream Engine Daemon - Port 9004 REST]
            FFmpegEngine[Pipeline FFmpeg / Xvfb / Chromium]
        end
    end

    %% Banco Relacional Neon
    subgraph Persistência Relacional [Neon Serverless PostgreSQL]
        DB_Users[(Tabela: users)]
        DB_VMs[(Tabela: vms)]
    end

    %% Conexões do Browser ao Next.js
    BrowserAdmin <-->|HTTPS / Cookies painel_session| Middleware
    Middleware --> AuthUsersRoute
    Middleware --> UploadRoute
    Middleware --> MetadataRoute
    Middleware --> VmComputeRoute
    RemoteDrawer <-->|HTTPS Polling 3s| VmProxy

    %% Conexões Next.js com Banco de Dados
    AuthUsersRoute <-->|SQL tagged template| DB_Users
    HeartbeatRoute <-->|SQL Upsert| DB_VMs

    %% Conexões Next.js com Magalu Cloud
    UploadRoute -->|PutObjectCommand / ACL public-read| MGC_S3
    MetadataRoute <-->|GetObject / PutObject songs.json| MGC_S3
    VmComputeRoute <-->|REST HTTPS x-api-key| MGC_Compute

    %% Proxy e Comunicação M2M com a VM
    VmProxy <-->|HTTP Port 9004 Server-to-Server| AuraEngine
    AuraEngine --->|POST Heartbeat & Telemetry com x-api-key| HeartbeatRoute
    AuraEngine --- FFmpegEngine
```

### Componentes Principais da Arquitetura:
1. **Next.js App Router (BFF - Backend for Frontend)**: Executa a renderização server-driven dos layouts e gerencia as Serverless Functions para ingestão de mídia, proxying seguro, rate limiting e autenticação.
2. **Neon Serverless PostgreSQL**: Banco de dados relacional baseado em driver `@neondatabase/serverless` via WebSockets/HTTP, armazenando os usuários com controle de acesso baseado em papéis (RBAC) e a tabela de telemetria das VMs registradas.
3. **Magalu Cloud Object Storage (S3)**: Armazena com alta resiliência os arquivos binários de áudio (`.mp3`), vídeos promocionais (`.mp4`), capas de faixas (`.jpg`/`.png`) e o arquivo central de sincronização de catálogo (`songs.json`) de cada canal de rádio.
4. **Magalu Cloud Compute API**: Interface REST oficial (`https://api.magalu.cloud/br-se1/compute/v1`) integrada para inspecionar métricas de hardware de cada instância (vCPUs, RAM, Disco, IP Público/Privado, Zona de Disponibilidade) e despachar comandos de ciclo de vida (`start`, `stop`, `reboot`).
5. **AuraStream Engine (VM Daemon)**: Processo residente em cada máquina virtual que expõe o servidor HTTP REST na porta `9004`. Recebe os comandos enviados via proxy do painel e envia periodicamente batimentos cardíacos (*heartbeats*) contendo status operacional e logs para o painel.

---

## 2. Fluxos e Engenharia do Sistema

### 2.1 Bypass de Bloqueio de Conteúdo Misto (*Mixed Content Mitigation*)
Quando o painel administrativo é implantado na nuvem sob HTTPS (como na Vercel ou Cloudflare Pages), os navegadores modernos bloqueiam por padrão conexões diretas não criptografadas (`http://<IP_DA_VM>:9004/api/...`) ou WebSockets inseguros (`ws://`), caracterizando violação de *Mixed Content*.

Para resolver essa restrição sem exigir a configuração de certificados SSL/TLS customizados e domínios dedicados para cada VM provisionada, o painel implementa um **Reverse Proxy Server-to-Server** em `src/app/api/vm-proxy/[vmIp]/[...path]/route.ts`:

```mermaid
sequenceDiagram
    autonumber
    participant Browser as Navegador (HTTPS)
    participant Proxy as Next.js API Proxy (HTTPS Server)
    participant VM as AuraStream Engine (VM HTTP Port 9004)

    Browser->>Proxy: GET /api/vm-proxy/200.50.81.12/state
    Note over Proxy: Validação Regex de IPv4 (Proteção anti-SSRF)<br/>Timeout de 5000ms via AbortController
    Proxy->>VM: GET http://200.50.81.12:9004/api/state
    VM-->>Proxy: 200 OK (Payload JSON do estado da rádio)
    Proxy-->>Browser: 200 OK (Repasse seguro em HTTPS)

    Browser->>Proxy: POST /api/vm-proxy/200.50.81.12/command { "event": "media:skip" }
    Proxy->>VM: POST http://200.50.81.12:9004/api/command { "event": "media:skip" }
    VM-->>Proxy: 200 OK (Estado atualizado da fila)
    Proxy-->>Browser: 200 OK
```

* **Proteção contra SSRF**: O parâmetro `vmIp` é validado estritamente por expressão regular (`/^\d{1,3}(\.\d{1,3}){3}$/`), impedindo ataques de injeção de host ou encaminhamento para endpoints internos indesejados.
* **Resiliência a Travamentos**: Implementa um `AbortController` com limite de tolerância de 5 segundos. Caso a VM esteja desligada ou a porta bloqueada, o proxy responde com `504 Gateway Timeout` ou `502 Bad Gateway`, acionando o estado visual de alerta no painel.

---

### 2.2 Pipeline de Ingestão de Mídia e Atomicidade do `songs.json`
O envio de arquivos de áudio e imagem para o bucket do **Magalu Cloud Object Storage** contorna uma limitação comum de *Presigned URLs* (URLs pré-assinadas), em que cabeçalhos de `Content-Type` e diretivas de ACL podem ser desconsiderados pelo gateway S3. 

O painel utiliza um fluxo via servidor com streaming `multipart/form-data`:

```mermaid
sequenceDiagram
    autonumber
    participant User as Administrador / Uploader
    participant Next as Next.js API Server
    participant S3 as Magalu Cloud Object Storage

    User->>Next: POST /api/admin/upload (Form: áudio MP3, canal, tipo)
    Note over Next: Conversão para buffer em memória / Stream<br/>Configuração de ACL: 'public-read'
    Next->>S3: PutObjectCommand (Key: {canal}/songs/{arquivo.mp3})
    S3-->>Next: Confirmação de Upload & ETag
    Next-->>User: Retorna publicUrl do objeto gravado

    User->>Next: POST /api/admin/metadata { canal, songData }
    Next->>S3: GetObjectCommand (Key: {canal}/songs.json)
    alt songs.json existe
        S3-->>Next: Retorna JSON com lista de faixas
    else songs.json não existe (Canal Novo)
        S3-->>Next: 404 NoSuchKey (Fallback: array vazio [])
    end
    Note over Next: Concatena nova faixa ao array de músicas<br/>Formata JSON identado (2 espaços)
    Next->>S3: PutObjectCommand (Key: {canal}/songs.json, ACL: 'public-read')
    S3-->>Next: Gravação confirmada
    Next-->>User: 200 OK (Catálogo do Canal Sincronizado)
```

* **Organização Estruturada no Bucket**:
  * Áudios: `{canal}/songs/{nome_arquivo}.mp3`
  * Vídeos de fundo: `{canal}/video/{nome_arquivo}.mp4`
  * Imagens de capa: `{canal}/images/{nome_arquivo}.jpg`
  * Índice de Metadados: `{canal}/songs.json`
* **Suporte a Arquivos Extensos**: Configurado no `next.config.ts` com `bodySizeLimit: '500mb'` e desativação do parser padrão na rota de upload para manipular arquivos pesados sem estourar limites de payload.

---

### 2.3 Orquestração e Ciclo de Vida de Instâncias Magalu Cloud
A interface em `/vms` estabelece a ponte direta com a infraestrutura de computação da Magalu Cloud:

* **Sincronização de Estado via API v1**: O endpoint `GET /api/vms` realiza uma chamada autenticada via `x-api-key` para `https://api.magalu.cloud/br-se1/compute/v1/instances?expand=machine-type,network`. Ele decodifica especificações de hardware (vCPUs, RAM convertida de MB para GB, armazenamento em disco, IPs públicos e privados e Availability Zone).
* **Ações de Energia**: O endpoint `POST /api/vms/[id]/action` despacha ordens de energia diretamente para a nuvem:
  * `start`: Inicia uma instância desligada.
  * `stop`: Desliga a instância com desligamento seguro do sistema operacional.
  * `reboot`: Reinicia o sistema operacional da máquina.
  * A API da Magalu Cloud responde com status `202 Accepted` para operações assíncronas de infraestrutura.
* **Canal M2M de Telemetria e Heartbeat**: O daemon residente na VM invoca periodicamente `POST /api/vms/heartbeat` autenticando-se através de um cabeçalho `x-api-key: INTERNAL_API_KEY`. O painel efetua um *upsert* na tabela `vms` do PostgreSQL atualizando o `last_ping`, canal ativo e status operacional.

---

### 2.4 Drawer de Controle Remoto em Tempo Real (`VmRemoteControl`)
Ao clicar no botão de controle de qualquer VM listada no painel, uma gaveta lateral (*Drawer*) interativa é aberta sobre a interface:

* **Polling Reativo a Cada 3 Segundos**: O componente estabelece polling contínuo através da rota de proxy `/api/vm-proxy/[vmIp]/state`, recuperando o estado atual da rádio sem bloquear a navegação.
* **Painel Now Playing**: Exibe a capa do álbum em reprodução, título da faixa, artista, tempo de atividade e indicador de status pulsante (`Ao vivo`, `Pausado`, `Reconectando`, `Parado` ou `Bloqueado`).
* **Controles Operacionais Completos**:
  * **Play / Pause**: Alterna o fluxo de áudio ativando/desativando o gerador de silêncio de segurança do FFmpeg.
  * **Skip & Previous**: Avança ou retrocede faixas em conformidade na fila.
  * **Volume Analógico**: Slider com resolução `0.01` que ajusta dinamicamente a taxa de ganho no decoder do FFmpeg na VM (`media:volume`).
  * **Stop Stream**: Finaliza com segurança as instâncias do Chromium/Puppeteer e do FFmpeg na VM.
  * **Reordenação Dinâmica da Fila**: Permite mover faixas para cima ou para baixo na fila através de botões direcionais, disparando o evento `queue:reorder`.
  * **Play Direto por Miniatura**: Clicar na arte de qualquer música na lista da fila aciona instantaneamente a faixa selecionada (`player:track_changed`).

---

### 2.5 Camada de Segurança, Rate Limiting e RBAC
* **Edge-Compatible JWT (`jose`)**: Autenticação stateless baseada em cookies criptografados `painel_session` (`HttpOnly`, `SameSite=Lax`, `Secure` em produção). A biblioteca `jose` foi adotada por utilizar a Web Crypto API nativa, viabilizando a execução imediata no Next.js Middleware sem dependências nativas de Node.js.
* **Proteção contra Força Bruta (Rate Limit)**: Implementado na rota `/api/auth/login` via `lru-cache`. Limita requisições a **5 tentativas a cada 5 minutos por endereço IP**. Em caso de sucesso, o histórico de falhas do IP é limpo imediatamente.
* **Controle de Acesso Baseado em Papéis (RBAC)**:
  * Papel `admin`: Acesso irrestrito a upload, painel de VMs, ações de energia e CRUD completo de usuários.
  * Papel `uploader`: Acesso restrito à listagem e upload de novas faixas musicais e capas.
  * Travas de Integridade: O sistema impede a autoexclusão da conta em uso e bloqueia a exclusão ou rebaixamento do último administrador cadastrado no banco.
* **Isolamento de Rotas M2M**: As rotas de máquina `/api/vms/heartbeat` e `/api/admin/telemetry` rejeitam requisições sem o cabeçalho `x-api-key` idêntico ao `INTERNAL_API_KEY`.

---

## 3. Modelo de Dados (Neon PostgreSQL)

As tabelas do sistema são estruturadas e migradas via `scripts/migrate.ts`:

```mermaid
erDiagram
    users {
        int id PK "SERIAL"
        text username UK "Nome de usuário único"
        text password_hash "Hash bcrypt (10 rounds)"
        text role "admin | uploader"
        timestamptz created_at "Data de criação"
    }

    vms {
        text id PK "UUID da Instância na Magalu Cloud"
        text name "Nome amigável da máquina"
        text status "offline | streaming | idle"
        text current_channel "Canal vinculado à transmissão"
        timestamptz last_ping "Timestamp do último heartbeat"
    }
```

### Especificação dos Campos:

#### Tabela `users`
| Campo | Tipo SQL | Modificadores | Descrição |
| :--- | :--- | :--- | :--- |
| `id` | `SERIAL` | `PRIMARY KEY` | Identificador único auto-incremental do usuário. |
| `username` | `TEXT` | `UNIQUE NOT NULL` | Nome de login único no sistema. |
| `password_hash` | `TEXT` | `NOT NULL` | Hash da senha gerado via algoritmo `bcryptjs` com salt cost 10. |
| `role` | `TEXT` | `NOT NULL DEFAULT 'uploader'` | Cargo atribuído: `'admin'` ou `'uploader'`. |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` | Data e hora UTC do cadastro. |

#### Tabela `vms`
| Campo | Tipo SQL | Modificadores | Descrição |
| :--- | :--- | :--- | :--- |
| `id` | `TEXT` | `PRIMARY KEY` | UUID da instância gerado pela API de Compute da Magalu Cloud. |
| `name` | `TEXT` | `NOT NULL` | Nome de identificação atribuído à máquina. |
| `status` | `TEXT` | `NOT NULL DEFAULT 'offline'` | Estado operacional relatado pelo daemon (`streaming`, `idle`, `offline`). |
| `current_channel`| `TEXT` | `NULLABLE` | Slug do canal de rádio sendo transmitido no momento. |
| `last_ping` | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` | Registro de data/hora da última recepção de sinal vital (Heartbeat). |

---

## 4. Estrutura do Diretório

```text
painel-stream/
├── .env.example              # Modelo documentado das variáveis de ambiente necessárias
├── next.config.ts            # Configuração do Next.js (bodySizeLimit de 500MB para uploads)
├── package.json              # Metadados do projeto e dependências de produção/desenvolvimento
├── postcss.config.mjs        # Configuração do motor PostCSS com Tailwind CSS v4
├── tsconfig.json             # Regras estritas de checagem do compilador TypeScript
├── scripts/
│   └── migrate.ts            # Script de migração DDL e Seed do Administrador padrão no Neon
├── src/
│   ├── app/
│   │   ├── layout.tsx        # Layout raiz com injeção de fontes e folhas de estilo globais
│   │   ├── globals.css       # Diretivas globais do Tailwind CSS v4
│   │   ├── favicon.ico       # Ícone da aplicação
│   │   ├── login/
│   │   │   └── page.tsx      # Interface de Login com tratamento de erros e bloqueio por rate limit
│   │   ├── (dashboard)/      # Grupo de rotas protegidas que compartilham o painel administrativo
│   │   │   ├── layout.tsx    # Layout da Dashboard (Sidebar responsiva, navegação e logout)
│   │   │   ├── page.tsx      # Rota /: Tela principal de catálogo e upload de mídias para S3
│   │   │   ├── users/
│   │   │   │   └── page.tsx  # Rota /users: Tabela interativa de CRUD de usuários e permissões
│   │   │   └── vms/
│   │   │       └── page.tsx  # Rota /vms: Monitoramento de hardware, ações energéticas e drawer
│   │   └── api/              # Endpoints HTTP REST (Serverless Functions)
│   │       ├── admin/
│   │       │   ├── channels/ # GET: Lista pastas (canais) existentes no S3
│   │       │   ├── metadata/ # GET/POST: Lê e atualiza atomicamente o songs.json no S3
│   │       │   ├── telemetry/# GET/POST: Recepção e consulta de logs das VMs (.telemetry.json)
│   │       │   └── upload/   # POST/PATCH: Upload multipart para S3 e correção de ACL pública
│   │       ├── auth/
│   │       │   ├── login/    # POST: Autenticação de credenciais com rate limiting e JWT
│   │       │   └── logout/   # POST: Revogação e expiração do cookie de sessão
│   │       ├── users/
│   │       │   ├── route.ts  # GET (Listar) e POST (Criar) usuários
│   │       │   └── [id]/     # PATCH (Atualizar senha/role) e DELETE (Remover usuário)
│   │       ├── vm-proxy/
│   │       │   └── [vmIp]/
│   │       │       └── [...path]/ # GET/POST: Proxy reverso seguro (contorna Mixed Content)
│   │       └── vms/
│   │           ├── route.ts  # GET: Consulta instâncias ativas na API da Magalu Cloud
│   │           ├── heartbeat/# POST: Endpoint M2M para registro de sinal vital das VMs
│   │           └── [id]/
│   │               └── action/ # POST: Despacha start/stop/reboot para a API da Magalu
│   ├── components/
│   │   └── VmRemoteControl.tsx # Drawer lateral interativo com player, fila e controles da VM
│   ├── lib/
│   │   ├── auth.ts           # Assinatura e verificação de tokens JWT via biblioteca 'jose'
│   │   ├── db.ts             # Cliente de template literal SQL para o Neon PostgreSQL
│   │   ├── rate-limit.ts     # Gerenciador de limites de requisições em memória (LRU Cache)
│   │   └── s3.ts             # Instância configurada do cliente AWS SDK S3 para a Magalu Cloud
│   └── middleware.ts         # Middleware de inspeção de rotas, cookies JWT e validação de API Key
```

---

## 5. Referência Completa de Endpoints (API)

### 5.1 Autenticação e Sessão

| Método | Rota | Autenticação | Rate Limit | Descrição |
| :--- | :--- | :--- | :--- | :--- |
| `POST` | `/api/auth/login` | Pública | 5 req / 5 min | Valida usuário/senha e injeta o cookie HTTP-only `painel_session`. |
| `POST` | `/api/auth/logout` | Pública | Ilimitado | Remove e expira o cookie de sessão do navegador. |

#### Exemplo de Payload - Login (`POST /api/auth/login`):
```json
// Request Body
{
  "username": "admin",
  "password": "senha-segura-aqui"
}

// Resposta 200 OK
{
  "success": true,
  "role": "admin"
}

// Resposta 429 Too Many Requests (Rate Limit excedido)
{
  "error": "Muitas tentativas de login. Tente novamente em 5 minutos."
}
```

---

### 5.2 Gestão de Usuários (RBAC)

| Método | Rota | Autenticação | Permissão | Descrição |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/users` | Cookie de Sessão | Qualquer | Lista os usuários cadastrados (sem expor hashes). |
| `POST` | `/api/users` | Cookie de Sessão | `admin` | Cadastra um novo usuário no sistema. |
| `PATCH`| `/api/users/[id]` | Cookie de Sessão | `admin` | Atualiza a role e/ou a senha de um usuário. |
| `DELETE`| `/api/users/[id]`| Cookie de Sessão | `admin` | Remove um usuário (protege último admin e autoexclusão). |

---

### 5.3 Monitoramento e Orquestração de VMs (Magalu Cloud)

| Método | Rota | Autenticação | Descrição |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/vms` | Cookie de Sessão | Consulta as instâncias ativas na Magalu Cloud Compute e formata métricas. |
| `POST`| `/api/vms/[id]/action` | Cookie de Sessão | Envia comandos de ciclo de vida (`start`, `stop`, `reboot`) para a nuvem. |
| `POST`| `/api/vms/heartbeat` | `x-api-key` | Endpoint M2M para registro de sinal vital das VMs de transmissão. |
| `GET` | `/api/admin/telemetry`| Cookie / M2M | Consulta o arquivo de telemetria consolidada de todas as instâncias. |
| `POST`| `/api/admin/telemetry`| `x-api-key` | Ingestão de telemetria detalhada (logs e status) enviada pela VM. |

#### Exemplo de Ação de VM (`POST /api/vms/[id]/action`):
```json
// Request Body
{
  "action": "reboot" // Valores aceitos: "start" | "stop" | "reboot"
}

// Resposta 200 OK
{
  "success": true,
  "message": "Comando reboot enviado."
}
```

#### Exemplo de Heartbeat M2M (`POST /api/vms/heartbeat`):
```http
POST /api/vms/heartbeat HTTP/1.1
Host: painel.dominio.com
x-api-key: sua-internal-api-key-aqui
Content-Type: application/json

{
  "id": "e0bfa934-bf38-422e-bf73-61a7a13d7fb1",
  "name": "aurastream-vm-01",
  "status": "streaming",
  "current_channel": "aurastream-lofi"
}
```

---

### 5.4 Mídias e Object Storage (S3)

| Método | Rota | Autenticação | Descrição |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/admin/channels` | Cookie de Sessão | Lista os canais (pastas raiz) existentes no bucket S3. |
| `GET` | `/api/admin/metadata` | Cookie de Sessão | Retorna o catálogo `songs.json` do canal especificado via query `?channel=`. |
| `POST`| `/api/admin/metadata` | Cookie de Sessão | Adiciona uma nova faixa e persiste atomicamente o `songs.json` no bucket. |
| `POST`| `/api/admin/upload` | Cookie de Sessão | Processa upload direto (`multipart/form-data`) e aplica ACL `public-read`. |
| `PATCH`| `/api/admin/upload` | Cookie de Sessão | Aplica ACL pública retroativamente a um objeto já existente no bucket. |

---

### 5.5 Proxy de Controle Remoto da VM

| Método | Rota | Autenticação | Descrição |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/vm-proxy/[vmIp]/state` | Cookie de Sessão | Encaminha requisição à porta 9004 da VM para obter o estado do player/fila. |
| `POST`| `/api/vm-proxy/[vmIp]/command` | Cookie de Sessão | Envia comandos de mídia (`media:play`, `media:skip`, `queue:reorder`, etc.). |

#### Comandos Suportados no Proxy:
* `{"event": "media:play"}`: Retoma a reprodução/stream.
* `{"event": "media:pause"}`: Pausa a transmissão e aciona o gerador de silêncio de segurança do FFmpeg.
* `{"event": "media:skip"}`: Pula para a próxima música em conformidade no catálogo.
* `{"event": "media:previous"}`: Retorna para a faixa anterior.
* `{"event": "media:stop_stream"}`: Encerra os processos de transmissão e fecha o navegador headless na VM.
* `{"event": "media:volume", "payload": 0.75}`: Altera o ganho de áudio de saída (de `0.0` a `2.0`).
* `{"event": "queue:reorder", "payload": {"newOrder": ["id-1", "id-2"]}}`: Atualiza a ordem da fila de reprodução.
* `{"event": "player:track_changed", "payload": {"trackId": "id-especifico"}}`: Toca diretamente uma faixa da fila.

---

## 6. Variáveis de Ambiente (`.env`)

Crie um arquivo `.env` na raiz do diretório `painel-stream/` configurando as variáveis abaixo:

```ini
# ==============================================================================
# MAGALU CLOUD OBJECT STORAGE (S3 COMPATIBLE)
# ==============================================================================
# Chave de acesso e segredo obtidos no console da Magalu Cloud
MGC_ACCESS_KEY_ID="sua-access-key-id"
MGC_SECRET_ACCESS_KEY="sua-secret-access-key"
# Endpoint regional da Magalu Cloud Objects (padrão Sudeste: br-se1)
MGC_ENDPOINT="https://br-se1.magaluobjects.com"
# Nome do bucket criado para hospedar os arquivos de mídia da rádio
MGC_BUCKET_NAME="seu-bucket-de-midias"

# ==============================================================================
# MAGALU CLOUD COMPUTE API
# ==============================================================================
# Chave de API gerada no portal da Magalu Cloud com permissão para instâncias
MGC_API_KEY="sua-api-key-magalu-cloud"
# Região das instâncias virtuais (ex: br-se1)
MGC_REGION="br-se1"

# ==============================================================================
# SEGURANÇA E AUTENTICAÇÃO
# ==============================================================================
# Segredo para assinatura dos tokens JWT pelo módulo jose
JWT_SECRET="gere-uma-chave-longa-e-aleatoria-com-mais-de-32-caracteres"

# Credenciais padrão para o administrador criado pelo script de migração (Seed)
ADMIN_USERNAME="admin"
ADMIN_PASSWORD="coloque-uma-senha-forte-aqui"

# ==============================================================================
# BANCO DE DADOS RELACIONAL (NEON SERVERLESS POSTGRESQL)
# ==============================================================================
# Connection string com pooler habilitado e sslmode obrigatório
DATABASE_URL="postgresql://usuario:senha@ep-xyz.us-east-2.aws.neon.tech/neondb?sslmode=require"

# ==============================================================================
# COMUNICAÇÃO INTERNA DE MÁQUINA (M2M)
# ==============================================================================
# Chave secreta compartilhada entre os daemons das VMs e o painel administrativo
INTERNAL_API_KEY="chave-de-autenticacao-compartilhada-vm-painel"
```

---

## 7. Instalação, Migração e Execução

### Pré-requisitos
* **Node.js**: Versão 20.x ou 22.x LTS instalada.
* **Gerenciador de Pacotes**: `npm` ou `yarn`.
* **Instância Neon PostgreSQL**: Uma base de dados ativa no Neon com a respectiva `DATABASE_URL`.
* **Credenciais Magalu Cloud**: Chaves com privilégios para Object Storage e Compute.

### Passo 1: Instalação das Dependências
```bash
npm install
# ou
yarn install
```

### Passo 2: Executar as Migrações do Banco de Dados
Execute o script de automação para provisionar as tabelas `users` e `vms` no Neon PostgreSQL e inserir o usuário administrador inicial:
```bash
npx tsx scripts/migrate.ts
```
*Saída esperada:*
```text
[migrate] Connecting to Neon...
[migrate] ✅ Table "users" ready.
[migrate] ✅ Table "vms" ready.
[migrate] ✅ Default admin created: admin
[migrate] 🎉 Done.
```

### Passo 3: Execução em Ambiente de Desenvolvimento
Inicie o servidor de desenvolvimento com suporte a hot-reload:
```bash
npm run dev
# ou
yarn dev
```
Acesse o painel no navegador: **[http://localhost:3000](http://localhost:3000)**.

### Passo 4: Build e Execução Otimizada para Produção
Para validar e compilar o pacote de produção:
```bash
npm run build
npm start
```

---

## 8. Decisões Arquiteturais e Trade-Offs Técnicos

1. **Next.js 16 + React 19 RSC**: Permite desfrutar do novo compilador do React e de layouts baseados em Server Components, reduzindo substancialmente a quantidade de JavaScript enviada ao navegador nos dashboards.
2. **Biblioteca `jose` em substituição a `jsonwebtoken`**: O Next.js Middleware executa sob a Web Crypto API (Edge Runtime). Módulos tradicionais como `jsonwebtoken` dependem do motor interno `crypto` do Node.js, tornando inviável sua execução em camadas de borda. O `jose` adere estritamente a padrões universais da web.
3. **Proxy HTTP Server-to-Server vs. WebSockets Diretos**: Ao invés de forçar os navegadores a abrirem conexões WebSocket diretas com as VMs da nuvem (o que exigiria nomes de domínio individuais, túneis reversos ou certificados SSL por IP de VM), o painel atua como um gateway HTTPS seguro, repassando comandos e sincronizando o estado da rádio com latência insignificante.
4. **Armazenamento de Mídia Multipart Server-Side**: Contorna incompatibilidades de gateways S3 que ignoram diretivas de cabeçalhos de tipo MIME ou listas de controle de acesso (`public-read`) quando enviadas via requisições diretas de clientes finais (presigned uploads).
5. **Driver `@neondatabase/serverless`**: Elimina a sobrecarga e o esgotamento de conexões persistentes (*Connection Exhaustion*) comuns em arquiteturas serverless tradicionais, utilizando pool HTTP/WebSocket inteligente fornecido pelo Neon.
