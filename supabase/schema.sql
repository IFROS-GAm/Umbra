create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  discriminator text not null default '0001',
  avatar_hue integer not null default 220,
  bio text not null default '',
  status text not null default 'offline' check (status in ('online', 'idle', 'dnd', 'invisible', 'offline')),
  custom_status text not null default '',
  theme text not null default 'dark' check (theme in ('dark', 'light')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles add column if not exists auth_user_id uuid;
alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists email_confirmed_at timestamptz;
alter table public.profiles add column if not exists auth_provider text not null default 'seed';
alter table public.profiles add column if not exists avatar_url text not null default '';
alter table public.profiles add column if not exists profile_banner_url text not null default '';
alter table public.profiles add column if not exists profile_color text not null default '#5865F2';

create unique index if not exists idx_profiles_auth_user_id
on public.profiles(auth_user_id)
where auth_user_id is not null;

create unique index if not exists idx_profiles_email
on public.profiles(email)
where email is not null;

create table if not exists public.guilds (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  icon_text text not null default '',
  banner_color text not null default '#5865F2',
  owner_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.guilds add column if not exists is_default boolean not null default false;

create table if not exists public.roles (
  id uuid primary key default gen_random_uuid(),
  guild_id uuid not null references public.guilds(id) on delete cascade,
  name text not null,
  color text not null default '#9AA4B2',
  position integer not null default 0,
  permissions bigint not null default 0,
  hoist boolean not null default false,
  mentionable boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.guild_members (
  guild_id uuid not null references public.guilds(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role_ids uuid[] not null default '{}',
  nickname text not null default '',
  joined_at timestamptz not null default now(),
  primary key (guild_id, user_id)
);

create table if not exists public.channels (
  id uuid primary key default gen_random_uuid(),
  guild_id uuid references public.guilds(id) on delete cascade,
  type text not null check (type in ('text', 'dm', 'group_dm')),
  name text not null default '',
  topic text not null default '',
  position integer not null default 0,
  parent_id uuid references public.channels(id) on delete set null,
  created_by uuid not null references public.profiles(id) on delete cascade,
  last_message_id uuid,
  last_message_author_id uuid references public.profiles(id) on delete set null,
  last_message_preview text not null default '',
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.channel_members (
  channel_id uuid not null references public.channels(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  last_read_message_id uuid,
  last_read_at timestamptz,
  hidden boolean not null default false,
  joined_at timestamptz not null default now(),
  primary key (channel_id, user_id)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.channels(id) on delete cascade,
  guild_id uuid references public.guilds(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  content text not null,
  reply_to uuid references public.messages(id) on delete set null,
  attachments jsonb not null default '[]'::jsonb,
  mention_user_ids uuid[] not null default '{}',
  edited_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.message_reactions (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);

create table if not exists public.channel_overwrites (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.channels(id) on delete cascade,
  target_id uuid not null,
  type text not null check (type in ('role', 'member')),
  allow bigint not null default 0,
  deny bigint not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.invites (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  guild_id uuid not null references public.guilds(id) on delete cascade,
  creator_id uuid not null references public.profiles(id) on delete cascade,
  uses integer not null default 0,
  max_uses integer,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_roles_guild_id on public.roles(guild_id);
create index if not exists idx_guild_members_user_id on public.guild_members(user_id);
create index if not exists idx_channels_guild_id on public.channels(guild_id);
create index if not exists idx_channel_members_user_id on public.channel_members(user_id);
create index if not exists idx_messages_channel_id_created_at on public.messages(channel_id, created_at desc);
create index if not exists idx_messages_guild_id on public.messages(guild_id);
create index if not exists idx_message_reactions_message_id on public.message_reactions(message_id);

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists trg_guilds_updated_at on public.guilds;
create trigger trg_guilds_updated_at
before update on public.guilds
for each row execute function public.set_updated_at();

drop trigger if exists trg_channels_updated_at on public.channels;
create trigger trg_channels_updated_at
before update on public.channels
for each row execute function public.set_updated_at();

select pg_notify('pgrst', 'reload schema');
