-- Convert bucket to private
UPDATE storage.buckets 
SET public = false 
WHERE id = 'consultor-arquivos';

-- Remove any existing public policies for this bucket if they exist
-- (Checking and dropping common generic public policies if found)
-- Note: Usually policies are specific to bucket_id

-- Create policies for authenticated access
-- SELECT: Allow all authenticated users to view files (since they are related to visits/clients they have access to)
CREATE POLICY "Allow authenticated users to view files" 
ON storage.objects 
FOR SELECT 
TO authenticated 
USING (bucket_id = 'consultor-arquivos');

-- INSERT: Allow authenticated users to upload files
CREATE POLICY "Allow authenticated users to upload files" 
ON storage.objects 
FOR INSERT 
TO authenticated 
WITH CHECK (bucket_id = 'consultor-arquivos');

-- UPDATE: Allow authenticated users to update files they uploaded (based on owner/folder structure if applicable, but for now simple authenticated)
CREATE POLICY "Allow authenticated users to update files" 
ON storage.objects 
FOR UPDATE 
TO authenticated 
USING (bucket_id = 'consultor-arquivos');

-- DELETE: Allow authenticated users to delete files
CREATE POLICY "Allow authenticated users to delete files" 
ON storage.objects 
FOR DELETE 
TO authenticated 
USING (bucket_id = 'consultor-arquivos');