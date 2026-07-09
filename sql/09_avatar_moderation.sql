-- ============================================================================
-- Hovio · 09_avatar_moderation.sql
-- Adds avatar moderation columns to profiles for the Cloudinary image upload
-- flow (Prompt 9 patch). Idempotent.
--
-- Split by data type (docs/integrations.md):
--   Public images (profile photos)  → Cloudinary (this migration).
--   Sensitive documents (credentials) → PRIVATE Supabase bucket (unchanged).
--
-- Moderation gate:
--   New/changed photos land in 'pending' state. The publicly-visible
--   avatar_url is only written when an admin approves the photo via:
--     PATCH /api/v1/admin/users/{uid}/avatar-status?action=approve
--   Until approved, seekers see the previous avatar_url (or no photo).
--
-- DPDP erasure (Prompt 17):
--   avatar_public_id is the Cloudinary handle. The erasure flow must call
--   ImageStorage.delete(avatar_public_id) before crypto-shredding the profile.
--   // TODO(Prompt 17): call delete_avatar(uid) from the DPDP erasure flow.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Extend profiles with avatar moderation fields
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists avatar_public_id     text,           -- Cloudinary public_id (for delete + transforms)
  add column if not exists avatar_pending_url   text,           -- uploaded but not yet moderated
  add column if not exists avatar_photo_status  text not null   -- 'none' | 'pending' | 'approved' | 'rejected'
    default 'none'
    check (avatar_photo_status in ('none', 'pending', 'approved', 'rejected'));

comment on column public.profiles.avatar_public_id is
  'Cloudinary public_id for the profile photo. Used for CDN transforms and DPDP erasure (Prompt 17). Never expose to the client.';

comment on column public.profiles.avatar_pending_url is
  'Uploaded photo URL pending admin moderation. NOT the public avatar_url — copied to avatar_url only on approval.';

comment on column public.profiles.avatar_photo_status is
  'Moderation state: none | pending | approved | rejected. avatar_url is only written on approve.';

-- ---------------------------------------------------------------------------
-- Index: admin portal can efficiently query all pending photos
-- ---------------------------------------------------------------------------
create index if not exists profiles_avatar_status_idx
  on public.profiles (avatar_photo_status)
  where avatar_photo_status = 'pending';
