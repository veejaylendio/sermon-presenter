-- Create profiles table (extends auth.users)
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text
);

-- Create sermons table
create table public.sermons (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  title text,
  raw_notes text not null,
  status text not null default 'draft', -- draft | parsed
  created_at timestamptz default now()
);

-- Create slides table
create table public.slides (
  id uuid primary key default gen_random_uuid(),
  sermon_id uuid references public.sermons(id) on delete cascade not null,
  order_index int not null,
  content text not null
);

-- Create presentations table
create table public.presentations (
  id uuid primary key default gen_random_uuid(),
  sermon_id uuid references public.sermons(id) on delete cascade not null,
  theme_slug text,
  custom_theme jsonb,        -- sanitized AI-authored ThemeConfig-shaped design, or null
  ai_theme_status text not null default 'idle', -- idle | pending | ready | failed
  ai_theme_error text,       -- last failure message, cleared when a new attempt starts
  content_storage_path text, -- internal only, never surfaced to the user as a "file"
  public_share_url text,     -- optional Vercel deploy link
  pdf_storage_path text,     -- nullable, only set if user exports to PDF
  status text not null default 'not_generated', -- not_generated | previewing_styles | generating | generated
  generated_at timestamptz,
  shared_at timestamptz
);

-- Create style_previews table
create table public.style_previews (
  id uuid primary key default gen_random_uuid(),
  presentation_id uuid references public.presentations(id) on delete cascade not null,
  theme_slug text not null,
  preview_thumbnail_url text,
  is_selected boolean default false
);

-- Create presentation_slides table
create table public.presentation_slides (
  id uuid primary key default gen_random_uuid(),
  presentation_id uuid references public.presentations(id) on delete cascade not null,
  slide_id uuid references public.slides(id) on delete set null,
  order_index int not null,
  thumbnail_url text
);

-- Create presentation_sessions table
create table public.presentation_sessions (
  id uuid primary key default gen_random_uuid(),
  presentation_id uuid references public.presentations(id) on delete cascade not null,
  screen_label text,
  current_slide_index int default 0,
  elapsed_seconds int default 0,
  status text not null default 'active' -- active | ended
);

-- Enable Row Level Security (RLS) on all tables
alter table public.profiles enable row level security;
alter table public.sermons enable row level security;
alter table public.slides enable row level security;
alter table public.presentations enable row level security;
alter table public.style_previews enable row level security;
alter table public.presentation_slides enable row level security;
alter table public.presentation_sessions enable row level security;

-- PROFILES policies
create policy "Users can view their own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id);

create policy "Users can insert their own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

-- SERMONS policies
create policy "Users can perform CRUD on their own sermons"
  on public.sermons for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- SLIDES policies
create policy "Users can perform CRUD on slides of their own sermons"
  on public.slides for all
  using (
    exists (
      select 1 from public.sermons
      where public.sermons.id = public.slides.sermon_id
      and public.sermons.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.sermons
      where public.sermons.id = public.slides.sermon_id
      and public.sermons.user_id = auth.uid()
    )
  );

-- PRESENTATIONS policies
create policy "Users can perform CRUD on presentations of their own sermons"
  on public.presentations for all
  using (
    exists (
      select 1 from public.sermons
      where public.sermons.id = public.presentations.sermon_id
      and public.sermons.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.sermons
      where public.sermons.id = public.presentations.sermon_id
      and public.sermons.user_id = auth.uid()
    )
  );

-- STYLE_PREVIEWS policies
create policy "Users can perform CRUD on style previews of their presentations"
  on public.style_previews for all
  using (
    exists (
      select 1 from public.presentations
      join public.sermons on public.presentations.sermon_id = public.sermons.id
      where public.presentations.id = public.style_previews.presentation_id
      and public.sermons.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.presentations
      join public.sermons on public.presentations.sermon_id = public.sermons.id
      where public.presentations.id = public.style_previews.presentation_id
      and public.sermons.user_id = auth.uid()
    )
  );

-- PRESENTATION_SLIDES policies
create policy "Users can perform CRUD on presentation slides of their presentations"
  on public.presentation_slides for all
  using (
    exists (
      select 1 from public.presentations
      join public.sermons on public.presentations.sermon_id = public.sermons.id
      where public.presentations.id = public.presentation_slides.presentation_id
      and public.sermons.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.presentations
      join public.sermons on public.presentations.sermon_id = public.sermons.id
      where public.presentations.id = public.presentation_slides.presentation_id
      and public.sermons.user_id = auth.uid()
    )
  );

-- PRESENTATION_SESSIONS policies
create policy "Users can perform CRUD on presentation sessions of their presentations"
  on public.presentation_sessions for all
  using (
    exists (
      select 1 from public.presentations
      join public.sermons on public.presentations.sermon_id = public.sermons.id
      where public.presentations.id = public.presentation_sessions.presentation_id
      and public.sermons.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.presentations
      join public.sermons on public.presentations.sermon_id = public.sermons.id
      where public.presentations.id = public.presentation_sessions.presentation_id
      and public.sermons.user_id = auth.uid()
    )
  );

-- Trigger to automatically create a profile when a new user signs up
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', ''),
    new.email
  );
  return new;
end;
$$ language plpgsql security definer;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Enable Realtime for presentation_sessions
alter publication supabase_realtime add table public.presentation_sessions;
