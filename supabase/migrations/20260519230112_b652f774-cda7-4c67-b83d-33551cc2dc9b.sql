-- Drop existing legacy policies that allow anonymous access
DROP POLICY IF EXISTS "Enable read access for all users" ON "public"."cliente_contatos";
DROP POLICY IF EXISTS "Enable insert for all users" ON "public"."cliente_contatos";
DROP POLICY IF EXISTS "Enable update for all users" ON "public"."cliente_contatos";
DROP POLICY IF EXISTS "Enable delete for all users" ON "public"."cliente_contatos";

-- Create new policies restricted to authenticated users
CREATE POLICY "Enable read access for authenticated users" 
ON "public"."cliente_contatos" 
FOR SELECT 
TO authenticated 
USING (true);

CREATE POLICY "Enable insert for authenticated users" 
ON "public"."cliente_contatos" 
FOR INSERT 
TO authenticated 
WITH CHECK (true);

CREATE POLICY "Enable update for authenticated users" 
ON "public"."cliente_contatos" 
FOR UPDATE 
TO authenticated 
USING (true) 
WITH CHECK (true);

CREATE POLICY "Enable delete for authenticated users" 
ON "public"."cliente_contatos" 
FOR DELETE 
TO authenticated 
USING (true);