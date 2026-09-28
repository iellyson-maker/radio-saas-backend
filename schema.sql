-- ============================================================
-- SCHEMA INICIAL - Plataforma SaaS de Automação de Rádio
-- PostgreSQL
-- ============================================================
-- Convenção: toda tabela de dados do cliente tem organization_id
-- (multi-tenância). Isso garante isolamento entre emissoras.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- 1. ORGANIZAÇÕES (cada emissora/cliente é uma organização)
-- ============================================================
CREATE TABLE organizations (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            VARCHAR(255) NOT NULL,          -- nome da rádio
    slug            VARCHAR(100) UNIQUE NOT NULL,    -- usado na URL do stream: /stream/{slug}
    plan            VARCHAR(50) NOT NULL DEFAULT 'trial', -- trial, basic, pro, enterprise
    status          VARCHAR(20) NOT NULL DEFAULT 'active', -- active, suspended, cancelled
    timezone        VARCHAR(50) NOT NULL DEFAULT 'America/Cuiaba',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 2. USUÁRIOS (podem pertencer a uma organização)
-- ============================================================
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name            VARCHAR(255) NOT NULL,
    email           VARCHAR(255) UNIQUE NOT NULL,
    password_hash   VARCHAR(255) NOT NULL,
    role            VARCHAR(30) NOT NULL DEFAULT 'operator', -- owner, admin, operator, viewer
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_users_org ON users(organization_id);

-- ============================================================
-- 3. CATEGORIAS DE MÍDIA (música, vinheta, comercial, spot, etc)
-- ============================================================
CREATE TABLE categories (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name            VARCHAR(100) NOT NULL,           -- ex: "Música", "Vinheta", "Comercial"
    type            VARCHAR(30) NOT NULL,             -- music, jingle, ad, id, other
    color           VARCHAR(7)                        -- cor hex p/ exibição no painel
);

CREATE INDEX idx_categories_org ON categories(organization_id);

-- ============================================================
-- 4. BIBLIOTECA DE MÍDIA (arquivos de áudio)
-- ============================================================
CREATE TABLE media_files (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    category_id     UUID REFERENCES categories(id) ON DELETE SET NULL,
    title           VARCHAR(255) NOT NULL,
    artist          VARCHAR(255),
    duration_seconds NUMERIC(8,2) NOT NULL,
    file_url        TEXT NOT NULL,                    -- caminho no object storage (S3/R2)
    file_format     VARCHAR(10) NOT NULL,              -- mp3, wav, ogg, flac
    file_size_bytes BIGINT,
    replay_gain_db  NUMERIC(5,2),                      -- normalização de volume
    expires_at      TIMESTAMPTZ,                       -- útil p/ comerciais com prazo de veiculação
    uploaded_by     UUID REFERENCES users(id),
    uploaded_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_media_org ON media_files(organization_id);
CREATE INDEX idx_media_category ON media_files(category_id);

-- ============================================================
-- 5. PLAYLISTS (agrupamentos de mídia)
-- ============================================================
CREATE TABLE playlists (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name            VARCHAR(255) NOT NULL,
    description     TEXT,
    shuffle         BOOLEAN NOT NULL DEFAULT false,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE playlist_items (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    playlist_id     UUID NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
    media_id        UUID NOT NULL REFERENCES media_files(id) ON DELETE CASCADE,
    position         INTEGER NOT NULL
);

CREATE INDEX idx_playlist_items_playlist ON playlist_items(playlist_id);

-- ============================================================
-- 6. GRADE DE PROGRAMAÇÃO (schedule)
-- ============================================================
-- Cada "slot" define o que toca em determinado dia/horário
CREATE TABLE schedule_slots (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    playlist_id     UUID REFERENCES playlists(id) ON DELETE SET NULL,
    day_of_week     SMALLINT NOT NULL,                 -- 0=domingo ... 6=sábado
    start_time      TIME NOT NULL,
    end_time        TIME NOT NULL,
    label           VARCHAR(255),                       -- ex: "Programa da Manhã"
    active          BOOLEAN NOT NULL DEFAULT true
);

CREATE INDEX idx_schedule_org_day ON schedule_slots(organization_id, day_of_week);

-- Regras de rotação/inserção automática (ex: vinheta a cada N músicas)
CREATE TABLE rotation_rules (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    category_id     UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    trigger_every_n_tracks INTEGER,                     -- ex: a cada 3 músicas
    fixed_times     TIME[],                              -- ex: horários fixos de bloco comercial
    active          BOOLEAN NOT NULL DEFAULT true
);

-- ============================================================
-- 7. INSTÂNCIAS DE STREAMING (1 processo Liquidsoap por emissora)
-- ============================================================
CREATE TABLE stream_instances (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
    icecast_mount   VARCHAR(255) NOT NULL,               -- ex: /stream/radiofulano
    stream_url      TEXT,
    status          VARCHAR(20) NOT NULL DEFAULT 'stopped', -- running, stopped, error
    container_id    VARCHAR(255),                         -- id do container Docker do worker
    last_heartbeat  TIMESTAMPTZ
);

-- ============================================================
-- 8. LOGS DE EXECUÇÃO (o que tocou, quando)
-- ============================================================
CREATE TABLE playback_logs (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    media_id        UUID REFERENCES media_files(id) ON DELETE SET NULL,
    played_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    source          VARCHAR(20) NOT NULL DEFAULT 'auto'    -- auto, manual
);

CREATE INDEX idx_logs_org_played ON playback_logs(organization_id, played_at);

-- ============================================================
-- 9. ASSINATURAS / BILLING
-- ============================================================
CREATE TABLE subscriptions (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id         UUID NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
    stripe_customer_id      VARCHAR(255),
    stripe_subscription_id  VARCHAR(255),
    plan                    VARCHAR(50) NOT NULL,
    status                  VARCHAR(30) NOT NULL DEFAULT 'trialing', -- trialing, active, past_due, cancelled
    current_period_end      TIMESTAMPTZ
);
