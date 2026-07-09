-- ============================================================================
-- Hovio · 08b_storage_policies.sql
-- Supabase Storage RLS policies for the private 'therapist-credentials' bucket.
-- ============================================================================

-- RLS is already enabled on storage.objects by default in Supabase.
-- Attempting to alter table directly will fail with ownership errors.


-- Policy: Allow therapists to upload files to their own directory
-- directory path is: {therapist_id}/filename
drop policy if exists "Allow therapist upload own credentials" on storage.objects;
create policy "Allow therapist upload own credentials" on storage.objects
  for insert with check (
    bucket_id = 'therapist-credentials'
    and auth.uid()::text = split_part(name, '/', 1)
  );

-- Policy: Allow therapists to read/download their own uploaded credentials
drop policy if exists "Allow therapist read own credentials" on storage.objects;
create policy "Allow therapist read own credentials" on storage.objects
  for select using (
    bucket_id = 'therapist-credentials'
    and auth.uid()::text = split_part(name, '/', 1)
  );
